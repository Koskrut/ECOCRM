import { Injectable } from "@nestjs/common";
import type { ExchangeRates } from "../settings/settings.service";
import { SettingsService } from "../settings/settings.service";
import { getBaseCurrency } from "../common/currency.util";
import { PrismaService } from "../prisma/prisma.service";
import { googleCampaignUrl } from "./adapters/google.adapter";
import { metaCampaignUrl } from "./adapters/meta.adapter";
import { tiktokCampaignUrl } from "./adapters/tiktok.adapter";
import { MarketingAccountService } from "./marketing-account.service";
import { MarketingAudienceService } from "./marketing-audience.service";
import {
  AUDIENCE_STALE_DAYS,
  CONTACT_HOURS_ALERT,
  CPL_GROWTH_ALERT,
  JUNK_MIN_RESOLVED,
  JUNK_SHARE_ALERT,
  MIN_SPEND_ALERT,
  type PaymentWindowDays,
} from "./marketing.constants";
import { classifyLeadPayment } from "./marketing-metrics";
import { toBaseOrNull } from "./marketing-money";
import {
  businessMinutesBetween,
  dayMatured,
  defaultPeriod,
  leadMatured,
  median,
  paymentInsideWindow,
  periodBounds,
  previousPeriod,
} from "./marketing-time";
import { DEFAULT_STAGE_LABELS } from "../leads/pipeline/lead-pipeline.defaults";

type PlatformFilter = "ALL" | "META" | "GOOGLE" | "TIKTOK";
const AD_PLATFORMS = ["META", "GOOGLE", "TIKTOK"] as const;

type Insight = {
  platform: string;
  accountExternalId: string;
  campaignExternalId: string;
  adSetExternalId: string;
  adExternalId: string;
  date: string;
  spend: number;
  currency: string;
};

type AdLead = {
  id: string;
  status: string;
  createdAt: Date;
  convertedOrderId: string | null;
  contactId: string | null;
  name: string | null;
  platform: string;
  campaignExternalId: string | null;
  adExternalId: string | null;
};

type Money = {
  orderId: string;
  amount: number;
  currency: string;
  paidAt: Date;
};

@Injectable()
export class MarketingDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly accounts: MarketingAccountService,
    private readonly audiences: MarketingAudienceService,
  ) {}

  async overview(input: { platform?: string; from?: string; to?: string; windowDays?: number }) {
    const now = new Date();
    const flags = await this.accounts.flags();
    const windowDays = this.window(input.windowDays, flags.paymentWindowDays);
    const period = input.from && input.to ? { from: input.from, to: input.to } : defaultPeriod(now, 30);
    const previous = previousPeriod(period.from, period.to);
    const platform = this.platform(input.platform);
    const rates = await this.settings.getExchangeRates();
    const loaded = await this.load(previous.from, period.to, platform);
    const current = this.metrics(period, windowDays, now, loaded, rates);
    const prev = this.metrics(previous, windowDays, now, loaded, rates);
    const accounts = await this.accounts.list();
    const visible = accounts.filter((account) => platform === "ALL" || account.platform === platform);
    const connected = visible.filter((account) => account.status !== "DISABLED");
    const insightCount = await this.prisma.marketingInsightDaily.count({
      where: { platform: platform === "ALL" ? { in: [...AD_PLATFORMS] } : platform },
    });
    const empty = connected.length === 0 ? "connect" : insightCount === 0 ? "collecting" : null;
    const labels = await this.stageLabels();
    const audienceStale = empty
      ? false
      : (await this.audiences.list()).some((row) => {
          if (row.preset !== "CLIENTS" || !row.enabled) return false;
          if (platform !== "ALL" && row.platform !== platform) return false;
          if (!row.lastSyncedAt) return true;
          return Date.now() - new Date(row.lastSyncedAt).getTime() > AUDIENCE_STALE_DAYS * 86_400_000;
        });
    return {
      empty,
      baseCurrency: getBaseCurrency(rates),
      period,
      previous,
      windowDays,
      stageLabels: labels,
      spend: current.spend,
      spendByCurrency: current.spendByCurrency,
      leads: current.leads,
      costPerLead: current.costPerLead,
      bad: current.bad,
      contactHours: current.contactHours,
      paymentsFromLeads: current.paymentsFromLeads,
      paymentsInPeriod: current.paymentsInPeriod,
      roi: current.roi,
      roiState: current.roiState,
      fxOk: current.fxOk,
      tiles: empty
        ? []
        : this.tiles(current, prev, visible.some((account) => account.status === "NEEDS_RECONNECT"), audienceStale),
    };
  }

  async campaigns(input: { platform?: string; from?: string; to?: string; windowDays?: number }) {
    const now = new Date();
    const flags = await this.accounts.flags();
    const windowDays = this.window(input.windowDays, flags.paymentWindowDays);
    const period = input.from && input.to ? { from: input.from, to: input.to } : defaultPeriod(now, 30);
    const platform = this.platform(input.platform);
    const rates = await this.settings.getExchangeRates();
    const loaded = await this.load(period.from, period.to, platform);
    const labels = await this.stageLabels();
    const entities = await this.prisma.marketingEntity.findMany({
      where: {
        level: { in: ["CAMPAIGN", "AD"] },
        ...(platform === "ALL" ? {} : { platform }),
      },
    });
    const accounts = await this.accounts.list();
    const keys = new Set<string>();
    for (const row of loaded.insights) {
      if (row.date >= period.from && row.date <= period.to) keys.add(`${row.platform}:${row.campaignExternalId}`);
    }
    for (const lead of loaded.leads) {
      if (lead.campaignExternalId) keys.add(`${lead.platform}:${lead.campaignExternalId}`);
    }
    const items = [...keys]
      .filter((key) => key.split(":")[1])
      .map((key) => {
        const [campaignPlatform, campaignExternalId] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
        const insights = loaded.insights.filter(
          (row) => row.platform === campaignPlatform && row.campaignExternalId === campaignExternalId && row.date >= period.from && row.date <= period.to,
        );
        const leads = loaded.leads.filter(
          (lead) => lead.platform === campaignPlatform && lead.campaignExternalId === campaignExternalId,
        );
        const metrics = this.metrics(period, windowDays, now, { ...loaded, insights, leads }, rates);
        const campaign = entities.find(
          (entity) => entity.level === "CAMPAIGN" && entity.platform === campaignPlatform && entity.externalId === campaignExternalId,
        );
        const adStatuses = entities
          .filter((entity) => entity.level === "AD" && entity.platform === campaignPlatform && insights.some((row) => row.adExternalId === entity.externalId))
          .map((entity) => entity.deliveryStatus);
        const account = accounts.find((item) => item.platform === campaignPlatform);
        return {
          platform: campaignPlatform,
          externalId: campaignExternalId,
          name: campaign?.name || campaignExternalId,
          status: this.delivery(adStatuses.length ? adStatuses : [campaign?.deliveryStatus ?? "UNKNOWN"]),
          spend: metrics.spend,
          spendByCurrency: metrics.spendByCurrency,
          leads: metrics.leads,
          costPerLead: metrics.costPerLead,
          bad: metrics.bad,
          contactHours: metrics.contactHours,
          paymentsFromLeads: metrics.paymentsFromLeads,
          roi: metrics.roi,
          roiState: metrics.roiState,
          fxOk: metrics.fxOk,
          openUrl: this.openUrl(campaignPlatform, account?.externalAccountId, campaignExternalId),
          adCount: new Set(insights.map((row) => row.adExternalId)).size,
        };
      });
    return { period, windowDays, baseCurrency: getBaseCurrency(rates), stageLabels: labels, items };
  }

  async campaign(platform: string, externalId: string, input: { from?: string; to?: string; windowDays?: number }) {
    const summary = await this.campaigns({ ...input, platform });
    const item = summary.items.find((row) => row.externalId === externalId && row.platform === platform);
    const now = new Date();
    const flags = await this.accounts.flags();
    const windowDays = this.window(input.windowDays, flags.paymentWindowDays);
    const period = input.from && input.to ? { from: input.from, to: input.to } : defaultPeriod(now, 30);
    const loaded = await this.load(period.from, period.to, this.platform(platform));
    const labels = summary.stageLabels;
    const insights = loaded.insights.filter(
      (row) => row.platform === platform && row.campaignExternalId === externalId && row.date >= period.from && row.date <= period.to,
    );
    const entities = await this.prisma.marketingEntity.findMany({
      where: {
        platform: platform === "GOOGLE" || platform === "TIKTOK" || platform === "META" ? platform : "META",
        OR: [{ externalId }, { parentExternalId: externalId }],
      },
    });
    const ads = [...new Set(insights.map((row) => row.adExternalId))].map((adId) => {
      const entity = entities.find((row) => row.level === "AD" && row.externalId === adId);
      const rows = insights.filter((row) => row.adExternalId === adId);
      const leadCount = loaded.leads.filter((lead) => lead.adExternalId === adId).length;
      return {
        externalId: adId,
        name: entity?.name || adId,
        status: this.delivery([entity?.deliveryStatus ?? "UNKNOWN"]),
        leads: leadCount,
        spendByCurrency: this.byCurrency(rows),
      };
    });
    const leads = loaded.leads
      .filter((lead) => lead.platform === platform && lead.campaignExternalId === externalId)
      .map((lead) => ({
        id: lead.id,
        name: lead.name || "Заявка",
        stage: labels[lead.status] ?? lead.status,
        status: lead.status,
      }));
    return { ...summary, item: item ?? null, ads, leads };
  }

  private async load(from: string, to: string, platform: PlatformFilter) {
    const bounds = periodBounds(from, to);
    const platformWhere = platform === "ALL" ? { in: [...AD_PLATFORMS] } : platform;
    const insightRows = await this.prisma.marketingInsightDaily.findMany({
      where: { platform: platformWhere, date: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) } },
    });
    const insights: Insight[] = insightRows.map((row) => ({
      platform: row.platform,
      accountExternalId: row.accountExternalId,
      campaignExternalId: row.campaignExternalId,
      adSetExternalId: row.adSetExternalId,
      adExternalId: row.adExternalId,
      date: row.date.toISOString().slice(0, 10),
      spend: Number(row.spend),
      currency: row.currency,
    }));
    const leadRows = await this.prisma.lead.findMany({
      where: {
        createdAt: { gte: bounds.start, lt: bounds.end },
        OR: [
          { marketingTouch: { countsTowardAds: true, ...(platform === "ALL" ? {} : { platform }) } },
          ...(platform === "ALL" || platform === "META"
            ? [{ attribution: { isNot: null }, marketingTouch: { is: null } } as const]
            : []),
        ],
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        convertedOrderId: true,
        contactId: true,
        name: true,
        fullName: true,
        marketingTouch: true,
        attribution: { select: { campaignId: true, adId: true } },
      },
    });
    const leads: AdLead[] = leadRows.map((lead) => ({
      id: lead.id,
      status: lead.status,
      createdAt: lead.createdAt,
      convertedOrderId: lead.convertedOrderId,
      contactId: lead.contactId,
      name: lead.name || lead.fullName,
      platform: lead.marketingTouch?.platform ?? "META",
      campaignExternalId: lead.marketingTouch?.campaignExternalId ?? lead.attribution?.campaignId ?? null,
      adExternalId: lead.marketingTouch?.adExternalId ?? lead.attribution?.adId ?? null,
    }));
    const orderIds = leads.map((lead) => lead.convertedOrderId).filter((id): id is string => Boolean(id));
    const paymentRows = orderIds.length
      ? await this.prisma.payment.findMany({
          where: {
            orderId: { in: orderIds },
            status: "COMPLETED",
            sourceType: { in: ["BANK", "CASH", "ONE_C"] },
          },
          select: { orderId: true, amount: true, currency: true, paidAt: true },
        })
      : [];
    const payments: Money[] = paymentRows.map((row) => ({
      orderId: row.orderId,
      amount: Number(row.amount),
      currency: row.currency,
      paidAt: row.paidAt,
    }));
    const contactHoursByLead = await this.contactHours(leads);
    return { insights, leads, payments, contactHoursByLead };
  }

  private metrics(
    period: { from: string; to: string },
    windowDays: number,
    now: Date,
    loaded: { insights: Insight[]; leads: AdLead[]; payments: Money[]; contactHoursByLead: Map<string, number> },
    rates: ExchangeRates,
  ) {
    const bounds = periodBounds(period.from, period.to);
    const insights = loaded.insights.filter((row) => row.date >= period.from && row.date <= period.to);
    const leads = loaded.leads.filter((lead) => lead.createdAt >= bounds.start && lead.createdAt < bounds.end);
    const spendByCurrency = this.byCurrency(insights);
    let fxOk = true;
    let spend = 0;
    for (const row of insights) {
      const base = toBaseOrNull(row.spend, row.currency, rates);
      if (base == null) fxOk = false;
      else spend += base;
    }
    spend = Math.round(spend * 100) / 100;
    const resolved = leads.filter((lead) => ["WON", "LOST", "SPAM", "NOT_TARGET"].includes(lead.status));
    const badCount = resolved.filter((lead) => lead.status === "SPAM" || lead.status === "NOT_TARGET").length;
    const hours = leads
      .map((lead) => loaded.contactHoursByLead.get(lead.id))
      .filter((value): value is number => value != null);
    const contact = median(hours);
    const matured = leads.filter((lead) => leadMatured(lead.createdAt, windowDays, now));
    const leadByOrder = new Map(leads.filter((lead) => lead.convertedOrderId).map((lead) => [lead.convertedOrderId as string, lead]));
    let paymentsFromLeads = 0;
    let paymentsInPeriod = 0;
    let roiPayments = 0;
    for (const payment of loaded.payments) {
      const lead = leadByOrder.get(payment.orderId);
      if (!lead) continue;
      const base = toBaseOrNull(payment.amount, payment.currency, rates);
      if (base == null) fxOk = false;
      const inPeriod = payment.paidAt >= bounds.start && payment.paidAt < bounds.end;
      if (inPeriod && base != null) paymentsInPeriod += base;
      const classified = classifyLeadPayment({
        insideWindow: paymentInsideWindow(payment.paidAt, lead.createdAt, windowDays),
        leadMatured: leadMatured(lead.createdAt, windowDays, now),
      });
      if (base != null) {
        if (classified.countInPaymentsFromLeads) paymentsFromLeads += base;
        if (classified.countInRoi) roiPayments += base;
      }
    }
    const maturedSpendRows = insights.filter((row) => dayMatured(row.date, windowDays, now));
    let roiSpend = 0;
    for (const row of maturedSpendRows) {
      const base = toBaseOrNull(row.spend, row.currency, rates);
      if (base != null) roiSpend += base;
    }
    const immature = insights.some((row) => !dayMatured(row.date, windowDays, now)) || leads.some((lead) => !leadMatured(lead.createdAt, windowDays, now));
    let roiState: "value" | "too_early" | "no_rate" | "no_spend" = "no_spend";
    let roi: number | null = null;
    if (!fxOk && (spend > 0 || paymentsFromLeads > 0)) roiState = "no_rate";
    else if (matured.length === 0 && immature) roiState = "too_early";
    else if (roiSpend > 0 && fxOk) {
      roiState = "value";
      roi = Math.round((roiPayments / roiSpend) * 100) / 100;
    } else if (immature) roiState = "too_early";
    const anyPayment = loaded.payments.some((payment) => leadByOrder.has(payment.orderId));
    return {
      spend: fxOk ? spend : null,
      spendByCurrency,
      leads: leads.length,
      costPerLead: fxOk && leads.length > 0 ? Math.round((spend / leads.length) * 100) / 100 : null,
      bad: { bad: badCount, resolved: resolved.length, ratio: resolved.length ? badCount / resolved.length : null },
      contactHours: contact == null ? null : Math.round(contact * 10) / 10,
      paymentsFromLeads: fxOk ? Math.round(paymentsFromLeads * 100) / 100 : null,
      paymentsInPeriod: fxOk ? Math.round(paymentsInPeriod * 100) / 100 : null,
      roi,
      roiState,
      fxOk,
      anyPayment,
      rawSpend: insights.reduce((sum, row) => sum + row.spend, 0),
    };
  }

  private tiles(
    current: ReturnType<MarketingDashboardService["metrics"]>,
    previous: ReturnType<MarketingDashboardService["metrics"]>,
    reconnect: boolean,
    audienceStale: boolean,
  ) {
    const tiles: Array<{ id: string; minimum?: number; previousCost?: number; currentCost?: number; hours?: number; threshold?: number }> = [];
    if (
      current.fxOk &&
      previous.fxOk &&
      current.costPerLead != null &&
      previous.costPerLead != null &&
      previous.costPerLead > 0 &&
      current.costPerLead > previous.costPerLead * CPL_GROWTH_ALERT &&
      (current.spend ?? 0) > MIN_SPEND_ALERT &&
      !current.anyPayment
    ) {
      tiles.push({
        id: "cpl",
        minimum: MIN_SPEND_ALERT,
        previousCost: previous.costPerLead,
        currentCost: current.costPerLead,
      });
    }
    if (current.rawSpend > 0 && current.leads === 0) tiles.push({ id: "spend_no_leads" });
    if (current.contactHours != null && current.contactHours > CONTACT_HOURS_ALERT) {
      tiles.push({ id: "slow_contact", hours: current.contactHours, threshold: CONTACT_HOURS_ALERT });
    }
    if (current.bad.resolved >= JUNK_MIN_RESOLVED && (current.bad.ratio ?? 0) > JUNK_SHARE_ALERT) {
      tiles.push({ id: "junk" });
    }
    if (reconnect) tiles.push({ id: "reconnect" });
    if (audienceStale) tiles.push({ id: "audience_stale" });
    return tiles;
  }

  private async contactHours(leads: AdLead[]): Promise<Map<string, number>> {
    const useful = leads.filter((lead) => lead.status !== "SPAM" && lead.status !== "NOT_TARGET");
    const ids = new Set(useful.map((lead) => lead.id));
    const contactIds = [...new Set(useful.map((lead) => lead.contactId).filter((id): id is string => Boolean(id)))];
    const result = new Map<string, number>();
    if (ids.size === 0) return result;
    const idList = [...ids];
    const [activities, events, calls, tasks, sessions] = await Promise.all([
      this.prisma.activity.findMany({
        where: { leadId: { in: idList }, type: { in: ["CALL", "MANUAL_CALL"] } },
        select: { leadId: true, occurredAt: true, createdAt: true },
      }),
      this.prisma.leadEvent.findMany({
        where: { leadId: { in: idList }, type: "CONTACTED" },
        select: { leadId: true, createdAt: true },
      }),
      this.prisma.call.findMany({
        where: { OR: [{ leadId: { in: idList } }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
        select: { leadId: true, contactId: true, startedAt: true },
      }),
      this.prisma.task.findMany({
        where: { OR: [{ leadId: { in: idList } }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
        select: { leadId: true, contactId: true, createdAt: true },
      }),
      this.prisma.manualCallSession.findMany({
        where: { OR: [{ leadId: { in: idList } }, ...(contactIds.length ? [{ contactId: { in: contactIds } }] : [])] },
        select: { leadId: true, contactId: true, createdAt: true },
      }),
    ]);
    const stamps = new Map<string, Date[]>();
    const push = (leadId: string, at: Date) => {
      const list = stamps.get(leadId) ?? [];
      list.push(at);
      stamps.set(leadId, list);
    };
    for (const row of activities) if (row.leadId) push(row.leadId, row.occurredAt ?? row.createdAt);
    for (const row of events) push(row.leadId, row.createdAt);
    const byContact = new Map<string, AdLead[]>();
    for (const lead of useful) {
      if (!lead.contactId) continue;
      const list = byContact.get(lead.contactId) ?? [];
      list.push(lead);
      byContact.set(lead.contactId, list);
    }
    const assign = (leadId: string | null, contactId: string | null, at: Date) => {
      if (leadId && ids.has(leadId)) {
        push(leadId, at);
        return;
      }
      const candidates = (contactId ? byContact.get(contactId) ?? [] : []).filter((lead) => lead.createdAt <= at);
      candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      if (candidates[0]) push(candidates[0].id, at);
    };
    for (const row of calls) assign(row.leadId, row.contactId, row.startedAt);
    for (const row of tasks) assign(row.leadId, row.contactId, row.createdAt);
    for (const row of sessions) assign(row.leadId, row.contactId, row.createdAt);
    for (const lead of useful) {
      const times = (stamps.get(lead.id) ?? []).filter((at) => at >= lead.createdAt);
      if (times.length === 0) continue;
      const first = times.reduce((min, at) => (at < min ? at : min));
      result.set(lead.id, businessMinutesBetween(lead.createdAt, first) / 60);
    }
    return result;
  }

  private byCurrency(rows: Array<{ currency: string; spend: number }>) {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.currency, (map.get(row.currency) ?? 0) + row.spend);
    return [...map.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }));
  }

  private delivery(statuses: string[]): "ACTIVE" | "PAUSED" | "COMPLETED" | "UNKNOWN" {
    if (statuses.includes("ACTIVE")) return "ACTIVE";
    if (statuses.includes("PAUSED")) return "PAUSED";
    if (statuses.includes("COMPLETED")) return "COMPLETED";
    return "UNKNOWN";
  }

  private openUrl(platform: string, accountId: string | undefined, campaignId: string): string | null {
    if (!accountId) return null;
    if (platform === "META") return metaCampaignUrl(accountId, campaignId);
    if (platform === "GOOGLE") return googleCampaignUrl(accountId, campaignId);
    if (platform === "TIKTOK") return tiktokCampaignUrl(accountId);
    return null;
  }

  private platform(value: string | undefined): PlatformFilter {
    if (value === "META" || value === "GOOGLE" || value === "TIKTOK") return value;
    return "ALL";
  }

  private window(value: number | undefined, fallback: PaymentWindowDays): PaymentWindowDays {
    if (value === 7 || value === 30 || value === 90) return value;
    return fallback;
  }

  private async stageLabels(): Promise<Record<string, string>> {
    const rows = await this.prisma.leadPipelineStage.findMany();
    const labels: Record<string, string> = { ...DEFAULT_STAGE_LABELS };
    for (const row of rows) labels[row.status] = row.label;
    return labels;
  }
}
