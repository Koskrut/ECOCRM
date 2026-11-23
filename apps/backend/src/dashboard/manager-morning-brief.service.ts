import { Injectable, Logger } from "@nestjs/common";
import { DateTime } from "luxon";
import { LeadStatus, UserRole } from "@prisma/client";
import { toBaseCurrency } from "../common/currency.util";
import { CRM_TIME_ZONE, todayYmdKyiv } from "../crm-timezone";
import { ContactsInsightsService } from "../contacts/contacts-insights.service";
import { NotificationsService } from "../notifications/notifications.service";
import { financialOverdueWhere } from "../orders/order-status-sync.mapper";
import { PrismaService } from "../prisma/prisma.service";
import { buildOperationalDebtOrderWhere } from "../receivables/receivables-scope.util";
import { SettingsService } from "../settings/settings.service";
import {
  buildMorningBriefTitle,
  formatMorningBriefBody,
  MORNING_BRIEF_TOP_OVERDUE,
  rankOverdueClients,
  splitMorningBriefText,
  type MorningBriefAtRiskClient,
  type MorningOverdueOrder,
} from "./manager-morning-brief.util";

const CONTACT_SIGNAL_CHUNK = 400;

function clientName(contact: {
  firstName: string | null;
  lastName: string | null;
}): string {
  const parts = [contact.lastName, contact.firstName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part && part !== "—" && part !== "-");
  return parts.join(" ") || "Клієнт";
}

function overdueDays(paymentDueDate: Date): number {
  const startOfToday = DateTime.fromISO(todayYmdKyiv(), { zone: CRM_TIME_ZONE }).startOf("day");
  const due = DateTime.fromJSDate(paymentDueDate).setZone(CRM_TIME_ZONE).startOf("day");
  return Math.max(0, Math.round(startOfToday.diff(due, "days").days));
}

@Injectable()
export class ManagerMorningBriefService {
  private readonly logger = new Logger(ManagerMorningBriefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
    private readonly insights: ContactsInsightsService,
  ) {}

  async sendMorningBriefs(dateRaw?: string): Promise<{ sent: number; skipped: number }> {
    const cfg = await this.settings.getTelegramMorningBriefConfig();
    if (!cfg.enabled) return { sent: 0, skipped: 0 };

    const dateYmd = dateRaw?.trim() || todayYmdKyiv();
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { in: [UserRole.MANAGER, UserRole.LEAD] },
        telegramChatId: { not: null },
      },
      select: { id: true },
      orderBy: { fullName: "asc" },
    });
    if (recipients.length === 0) return { sent: 0, skipped: 0 };

    const userIds = recipients.map((r) => r.id);
    const [leadsByOwner, atRiskByOwner, overdueByOwner, rates] = await Promise.all([
      this.countOpenLeads(userIds),
      this.listAtRisk(userIds),
      this.overdueByOwner(userIds),
      this.settings.getExchangeRates(),
    ]);
    const currency = rates.baseCurrency === "EUR" ? "EUR" : "USD";
    const title = buildMorningBriefTitle(dateYmd);

    let sent = 0;
    let skipped = 0;
    for (const recipient of recipients) {
      const existing = await this.prisma.userNotification.findFirst({
        where: {
          userId: recipient.id,
          type: "MORNING_BRIEF",
          entityId: dateYmd,
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      const overdue = overdueByOwner.get(recipient.id) ?? {
        totalClients: 0,
        top: [],
      };
      const bodies = splitMorningBriefText(
        formatMorningBriefBody({
          leadsOpen: leadsByOwner.get(recipient.id) ?? 0,
          atRiskClients: atRiskByOwner.get(recipient.id) ?? [],
          overdueTotal: overdue.totalClients,
          overdueTop: overdue.top,
          currency,
        }),
      );
      let createdAny = false;
      for (let part = 0; part < bodies.length; part += 1) {
        const created = await this.notifications.create({
          userId: recipient.id,
          type: "MORNING_BRIEF",
          title: part === 0 ? title : `${title} · ${part + 1}`,
          body: bodies[part],
          entityType: "CALENDAR_DAY",
          entityId: part === 0 ? dateYmd : `${dateYmd}:${part + 1}`,
        });
        if (created) createdAny = true;
      }
      if (createdAny) sent += 1;
      else skipped += 1;
    }

    this.logger.log(`Morning briefs for ${dateYmd}: sent=${sent} skipped=${skipped}`);
    return { sent, skipped };
  }

  private async countOpenLeads(userIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    const groups = await this.prisma.lead.groupBy({
      by: ["ownerId"],
      where: {
        ownerId: { in: userIds },
        status: { in: [LeadStatus.NEW, LeadStatus.IN_PROGRESS] },
      },
      _count: { id: true },
    });
    for (const group of groups) {
      if (group.ownerId) counts.set(group.ownerId, group._count.id);
    }
    return counts;
  }

  private async listAtRisk(userIds: string[]): Promise<Map<string, MorningBriefAtRiskClient[]>> {
    const lists = new Map<string, MorningBriefAtRiskClient[]>(userIds.map((id) => [id, []]));
    const contacts = await this.prisma.contact.findMany({
      where: { ownerId: { in: userIds } },
      select: {
        id: true,
        ownerId: true,
        createdAt: true,
        firstName: true,
        lastName: true,
        status: true,
        marketingCallOptOut: true,
      },
    });
    const eligible = contacts.filter(
      (contact) => contact.ownerId && this.insights.buildExclusionSet(contact).length === 0,
    );
    for (let i = 0; i < eligible.length; i += CONTACT_SIGNAL_CHUNK) {
      const slice = eligible.slice(i, i + CONTACT_SIGNAL_CHUNK);
      const signals = await this.insights.buildSignalsForContacts(
        slice.map((contact) => ({ id: contact.id, createdAt: contact.createdAt })),
      );
      for (const contact of slice) {
        const ownerId = contact.ownerId;
        if (!ownerId) continue;
        const signal = signals.get(contact.id);
        if (!signal?.isAtRisk) continue;
        const list = lists.get(ownerId) ?? [];
        list.push({
          name: clientName(contact),
          daysSinceLastOrder: signal.daysSinceLastOrder ?? null,
          daysSinceLastContact: signal.daysSinceLastContact ?? null,
        });
        lists.set(ownerId, list);
      }
    }
    for (const list of lists.values()) {
      list.sort((a, b) => {
        const orderDelta = (b.daysSinceLastOrder ?? -1) - (a.daysSinceLastOrder ?? -1);
        if (orderDelta !== 0) return orderDelta;
        return a.name.localeCompare(b.name, "uk");
      });
    }
    return lists;
  }

  private async overdueByOwner(userIds: string[]) {
    const rates = await this.settings.getExchangeRates();
    const orders = await this.prisma.order.findMany({
      where: buildOperationalDebtOrderWhere({
        ...financialOverdueWhere(),
        client: { ownerId: { in: userIds } },
      }),
      select: {
        debtAmount: true,
        currency: true,
        paymentDueDate: true,
        client: {
          select: { id: true, ownerId: true, firstName: true, lastName: true },
        },
      },
    });

    const byOwner = new Map<string, MorningOverdueOrder[]>();
    for (const order of orders) {
      const client = order.client;
      if (!client?.ownerId || !order.paymentDueDate) continue;
      const amount = toBaseCurrency(Number(order.debtAmount) || 0, order.currency, rates);
      if (!(amount > 0)) continue;
      const list = byOwner.get(client.ownerId) ?? [];
      list.push({
        contactId: client.id,
        name: clientName(client),
        amount,
        days: overdueDays(order.paymentDueDate),
      });
      byOwner.set(client.ownerId, list);
    }

    const ranked = new Map<string, ReturnType<typeof rankOverdueClients>>();
    for (const [ownerId, rows] of byOwner) {
      ranked.set(ownerId, rankOverdueClients(rows, MORNING_BRIEF_TOP_OVERDUE));
    }
    return ranked;
  }
}
