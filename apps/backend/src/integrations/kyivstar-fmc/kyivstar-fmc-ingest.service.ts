import { Injectable, Logger, Optional, UnauthorizedException } from "@nestjs/common";
import { ActivityType, LeadSource, LeadStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PhoneEntityLookupService } from "../../common/phone-entity-lookup.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { KYIVSTAR_FMC_PROVIDER } from "./kyivstar-fmc.constants";

export { KYIVSTAR_FMC_PROVIDER } from "./kyivstar-fmc.constants";

type KyivstarRawPayload = Record<string, unknown>;
type NormalizedDirection = "INBOUND" | "OUTBOUND" | "LOCAL" | "UNKNOWN";

export type KyivstarFmcIngestBatchMetrics = {
  total: number;
  processed: number;
  missingCallId: number;
  byType: { inbound: number; outbound: number; local: number; unknown: number };
};

type KyivstarFmcIngestEventMetrics = {
  processed: boolean;
  missingCallId: boolean;
  direction: NormalizedDirection;
};

type NormalizedRecording = {
  url?: string;
  status: "PENDING" | "READY" | "FAILED";
  recordId?: string;
};

@Injectable()
export class KyivstarFmcIngestService {
  private readonly logger = new Logger(KyivstarFmcIngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneEntityLookup: PhoneEntityLookupService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async handleCallStateWebhook(body: unknown, authHeader: string | undefined): Promise<void> {
    await this.assertWebhookToken(authHeader);
    await this.ingestCallStateEvent(body);
    await this.touchLastWebhookAt();
  }

  async ingestFromCallHistory(body: unknown): Promise<KyivstarFmcIngestBatchMetrics> {
    const events = this.normalizeHistoryPayload(body);
    const summary: KyivstarFmcIngestBatchMetrics = {
      total: events.length,
      processed: 0,
      missingCallId: 0,
      byType: { inbound: 0, outbound: 0, local: 0, unknown: 0 },
    };

    for (const item of events) {
      const m = await this.ingestHistoryEvent(item);
      if (m.processed) summary.processed += 1;
      if (m.missingCallId) summary.missingCallId += 1;
      if (m.direction === "INBOUND") summary.byType.inbound += 1;
      else if (m.direction === "OUTBOUND") summary.byType.outbound += 1;
      else if (m.direction === "LOCAL") summary.byType.local += 1;
      else summary.byType.unknown += 1;
    }

    this.logger.log(
      `Kyivstar FMC ingest batch: total=${summary.total}, processed=${summary.processed}, type[in=${summary.byType.inbound},out=${summary.byType.outbound},local=${summary.byType.local},unk=${summary.byType.unknown}], missingCallId=${summary.missingCallId}`,
    );

    return summary;
  }

  buildRecordingProxyUrl(recordId: string): string {
    const encoded = encodeURIComponent(recordId.trim());
    return `/api/integrations/kyivstar-fmc/recordings?record_id=${encoded}`;
  }

  private normalizeHistoryPayload(body: unknown): KyivstarRawPayload[] {
    if (Array.isArray(body)) {
      return body.filter((x) => x && typeof x === "object") as KyivstarRawPayload[];
    }
    if (body && typeof body === "object") {
      const calls = (body as { Calls?: unknown }).Calls;
      if (Array.isArray(calls)) {
        return calls.filter((x) => x && typeof x === "object") as KyivstarRawPayload[];
      }
      return [body as KyivstarRawPayload];
    }
    return [];
  }

  private async assertWebhookToken(authHeader: string | undefined): Promise<void> {
    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: KYIVSTAR_FMC_PROVIDER },
    });
    const expected =
      (setting?.webhookSecret as string | null) ??
      process.env.KYIVSTAR_FMC_WEBHOOK_SECRET ??
      null;

    const provided = this.extractBearerToken(authHeader);
    if (!expected || !provided || provided !== expected) {
      this.logger.warn("Kyivstar FMC webhook token mismatch or not configured");
      throw new UnauthorizedException("Invalid Kyivstar FMC webhook token");
    }
  }

  private extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    return m?.[1]?.trim() || null;
  }

  private async touchLastWebhookAt(): Promise<void> {
    await this.prisma.integrationSetting.updateMany({
      where: { provider: KYIVSTAR_FMC_PROVIDER },
      data: { lastWebhookAt: new Date() },
    });
  }

  private async ingestCallStateEvent(body: unknown): Promise<void> {
    if (!body || typeof body !== "object") return;
    const raw = body as KyivstarRawPayload;
    const callId = this.extractCallId(raw);
    if (!callId) {
      this.logger.warn("Kyivstar callstate without call_id, skipping", { raw });
      return;
    }

    const stateType = String(raw.state_type ?? "").trim().toLowerCase();
    const direction = this.resolveDirectionFromPayload(raw);
    let { customerPhoneRaw, managerPhoneRaw } = this.extractPhones(raw, direction);
    let customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
    let managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);

    const mapCfg = await this.getUserMappingConfig();
    const managerUserId = this.resolveManagerUserIdFromConfig(mapCfg, managerPhoneRaw);

    const callControlId =
      typeof raw.call_control_id === "string" && raw.call_control_id.trim()
        ? raw.call_control_id.trim()
        : null;

    const existing = await this.prisma.call.findUnique({
      where: { provider_externalId: { provider: KYIVSTAR_FMC_PROVIDER, externalId: callId } },
      select: { id: true, status: true, startedAt: true, contactId: true, leadId: true },
    });

    let status = existing?.status ?? "UNKNOWN";
    if (stateType === "alerting") status = "RINGING";
    else if (stateType === "established") status = "IN_PROGRESS";
    else if (stateType === "finished") {
      status = existing?.status === "IN_PROGRESS" ? "ANSWERED" : "MISSED";
    }

    const startedAt = existing?.startedAt ?? new Date();

    let contactId: string | null = existing?.contactId ?? null;
    let leadId: string | null = existing?.leadId ?? null;
    let companyId: string | null = null;

    if (
      (stateType === "alerting" || stateType === "established") &&
      direction === "INBOUND" &&
      customerPhoneNormalized
    ) {
      const phoneForEntityMatch = this.entityMatchPhoneForInbound(
        direction,
        customerPhoneNormalized,
        managerPhoneNormalized,
      );
      const matched = await this.matchOrCreateEntities(
        phoneForEntityMatch,
        raw,
        managerUserId,
      );
      contactId = matched.contactId;
      leadId = matched.leadId;
      companyId = matched.companyId;
    }

    const meta = {
      liveState: stateType,
      callControlId,
    } as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      const call = await tx.call.upsert({
        where: { provider_externalId: { provider: KYIVSTAR_FMC_PROVIDER, externalId: callId } },
        create: {
          provider: KYIVSTAR_FMC_PROVIDER,
          externalId: callId,
          direction,
          from: customerPhoneRaw ?? "",
          to: managerPhoneRaw ?? "",
          fromNormalized: customerPhoneNormalized,
          toNormalized: managerPhoneNormalized,
          startedAt,
          status,
          recordingStatus: "PENDING",
          meta,
          rawPayload: raw as Prisma.JsonObject,
          managerUserId,
          contactId,
          leadId,
          companyId,
        },
        update: {
          direction,
          from: customerPhoneRaw ?? undefined,
          to: managerPhoneRaw ?? undefined,
          fromNormalized: customerPhoneNormalized,
          toNormalized: managerPhoneNormalized,
          status,
          managerUserId: managerUserId ?? undefined,
          meta,
          rawPayload: raw as Prisma.JsonObject,
          contactId: contactId ?? undefined,
          leadId: leadId ?? undefined,
          companyId: companyId ?? undefined,
        },
      });

      if (stateType === "alerting" && direction === "INBOUND") {
        const hasActivity = await tx.activity.findFirst({
          where: { callId: call.id },
          select: { id: true },
        });
        if (!hasActivity) {
          await this.createCallActivity(tx, call.id, startedAt, {
            contactId: call.contactId,
            companyId: call.companyId,
            leadId: call.leadId,
            direction,
            status: "RINGING",
            customerPhoneNormalized,
            managerUserId,
          });
        }
      }
    });

    this.logger.log(
      `Kyivstar callstate: call_id=${callId}, state=${stateType}, direction=${direction}, manager=${managerUserId ?? "?"}`,
    );
  }

  private async ingestHistoryEvent(raw: KyivstarRawPayload): Promise<KyivstarFmcIngestEventMetrics> {
    const direction = this.resolveDirectionFromPayload(raw);
    const metrics: KyivstarFmcIngestEventMetrics = {
      processed: false,
      missingCallId: false,
      direction,
    };

    try {
      const externalId = this.extractCallId(raw);
      if (!externalId) {
        metrics.missingCallId = true;
        this.logger.warn("Kyivstar call history item without call_id, skipping", { raw });
        return metrics;
      }

      const startedAt = this.extractDate(raw, ["start_datetime", "start_timestamp"]);
      if (!startedAt) {
        this.logger.warn("Kyivstar call without start_datetime, skipping", { externalId });
        return metrics;
      }

      const endedAt = this.extractDate(raw, ["end_datetime", "end_timestamp"]);
      const durationSec = this.extractNumber(raw, ["call_duration", "duration"]);
      const ringing = this.extractNumber(raw, ["ringing"]);
      const cause = this.extractNumber(raw, ["cause"]);
      const status = this.resolveStatusFromHistory(durationSec, cause);
      const recording = this.extractRecording(raw);

      let { customerPhoneRaw, managerPhoneRaw } = this.extractPhones(raw, direction);
      let customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
      let managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);

      const mapCfg = await this.getUserMappingConfig();
      if (direction === "UNKNOWN") {
        const customerLegUserId = this.resolveUserIdByPhoneNormalized(
          mapCfg.phonesToUserId,
          customerPhoneNormalized,
        );
        const managerLegUserId = this.resolveUserIdByPhoneNormalized(
          mapCfg.phonesToUserId,
          managerPhoneNormalized,
        );
        if (customerLegUserId && !managerLegUserId) {
          ({ customerPhoneRaw, managerPhoneRaw } = {
            customerPhoneRaw: managerPhoneRaw,
            managerPhoneRaw: customerPhoneRaw,
          });
          customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
          managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);
        }
      }

      const phoneForEntityMatch = this.entityMatchPhoneForInbound(
        direction,
        customerPhoneNormalized,
        managerPhoneNormalized,
      );

      const customerAsManagerUserId = this.resolveUserIdByPhoneNormalized(
        mapCfg.phonesToUserId,
        customerPhoneNormalized,
      );
      const entityPhone =
        customerAsManagerUserId && direction !== "LOCAL" ? null : phoneForEntityMatch;

      const managerUserId = this.resolveManagerUserIdFromConfig(mapCfg, managerPhoneRaw);
      const { contactId, leadId, companyId } = await this.matchOrCreateEntities(
        entityPhone,
        raw,
        managerUserId,
      );

      const isInternalCall = direction === "LOCAL";

      const callData: Prisma.CallUncheckedCreateInput = {
        provider: KYIVSTAR_FMC_PROVIDER,
        externalId,
        direction,
        from: customerPhoneRaw ?? "",
        to: managerPhoneRaw ?? "",
        fromNormalized: customerPhoneNormalized,
        toNormalized: managerPhoneNormalized,
        startedAt,
        endedAt: endedAt ?? null,
        durationSec: durationSec ?? null,
        status,
        recordingUrl: recording.url ?? null,
        recordingStatus: recording.status,
        meta: {
          talkSec: durationSec,
          waitingSec: ringing,
          isInternalCall,
          recordId: recording.recordId ?? null,
          cause,
        } as Prisma.InputJsonValue,
        rawPayload: raw as Prisma.JsonObject,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        companyId: companyId ?? null,
        managerUserId: managerUserId ?? null,
      };

      await this.prisma.$transaction(async (tx) => {
        const call = await tx.call.upsert({
          where: {
            provider_externalId: { provider: KYIVSTAR_FMC_PROVIDER, externalId },
          },
          create: callData,
          update: {
            direction: callData.direction,
            from: callData.from,
            to: callData.to,
            fromNormalized: callData.fromNormalized,
            toNormalized: callData.toNormalized,
            startedAt: callData.startedAt,
            endedAt: callData.endedAt,
            durationSec: callData.durationSec,
            status: callData.status,
            recordingUrl: callData.recordingUrl,
            recordingStatus: callData.recordingStatus,
            contactId: callData.contactId,
            leadId: callData.leadId,
            companyId: callData.companyId,
            managerUserId: callData.managerUserId,
            meta: callData.meta,
            rawPayload: callData.rawPayload,
          },
        });

        const existingActivity = await tx.activity.findFirst({
          where: { callId: call.id },
          select: { id: true, leadId: true, contactId: true, companyId: true },
        });

        if (!existingActivity) {
          await this.createCallActivity(tx, call.id, call.startedAt, {
            contactId: call.contactId,
            companyId: call.companyId,
            leadId: call.leadId,
            direction,
            status,
            durationSec: call.durationSec ?? undefined,
            customerPhoneNormalized,
            managerUserId,
          });
        } else if (recording.url) {
          await tx.activity.updateMany({
            where: { callId: call.id },
            data: {
              body: this.buildActivityBody({
                direction,
                status,
                durationSec: call.durationSec ?? undefined,
                customerPhoneNormalized,
                hasRecording: true,
              }),
            },
          });
        }

        if (this.isMissed(status) && customerPhoneNormalized && direction === "INBOUND") {
          await this.createMissedCallTaskActivity(tx, {
            contactId,
            companyId,
            leadId,
            customerPhoneNormalized,
            managerUserId,
            startedAt,
          });
        }
      });

      if (this.isMissed(status) && customerPhoneNormalized && direction === "INBOUND" && managerUserId) {
        void this.notifications?.notifyMissedCall({
          managerUserId,
          customerPhone: customerPhoneNormalized,
          contactId,
          leadId,
          companyId,
        });
      }

      metrics.processed = true;
      return metrics;
    } catch (e) {
      this.logger.error(
        "Failed to ingest Kyivstar FMC event",
        e instanceof Error ? e.stack : String(e),
      );
      return metrics;
    }
  }

  private async getUserMappingConfig(): Promise<{
    phonesToUserId: Record<string, string>;
    defaultManagerId: string | null;
  }> {
    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: KYIVSTAR_FMC_PROVIDER },
      select: { config: true },
    });
    const cfg = (setting?.config ?? null) as
      | { phonesToUserId?: Record<string, string>; defaultManagerId?: string }
      | null;
    return {
      phonesToUserId: cfg?.phonesToUserId ?? {},
      defaultManagerId: cfg?.defaultManagerId ?? null,
    };
  }

  private extractCallId(raw: KyivstarRawPayload): string | null {
    for (const key of ["call_id", "callId", "id"]) {
      const v = raw[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  }

  private resolveDirectionFromPayload(raw: KyivstarRawPayload): NormalizedDirection {
    const dir = String(raw.direction ?? raw.call_direction ?? "").trim().toLowerCase();
    if (dir === "incoming" || dir === "inbound" || dir === "in") return "INBOUND";
    if (dir === "outgoing" || dir === "outbound" || dir === "out") return "OUTBOUND";
    if (dir === "local") return "LOCAL";
    return "UNKNOWN";
  }

  private extractPhones(
    raw: KyivstarRawPayload,
    direction: NormalizedDirection,
  ): { customerPhoneRaw?: string; managerPhoneRaw?: string } {
    const calling = String(raw.calling_number ?? raw.state_owner ?? "").trim() || undefined;
    const called = String(raw.called_number ?? "").trim() || undefined;
    const remote = String(raw.phone_number ?? "").trim() || undefined;
    const owner = String(raw.state_owner ?? "").trim() || undefined;

    if (direction === "INBOUND") {
      return {
        customerPhoneRaw: remote ?? calling,
        managerPhoneRaw: owner ?? called,
      };
    }
    if (direction === "OUTBOUND") {
      return {
        customerPhoneRaw: remote ?? called,
        managerPhoneRaw: owner ?? calling,
      };
    }
    if (direction === "LOCAL") {
      return { customerPhoneRaw: calling, managerPhoneRaw: called };
    }

    if (calling && called) {
      return { customerPhoneRaw: calling, managerPhoneRaw: called };
    }
    return { customerPhoneRaw: remote ?? calling, managerPhoneRaw: owner ?? called };
  }

  private resolveStatusFromHistory(durationSec: number | null, cause: number | null): string {
    if (durationSec === 0) {
      if (cause === 17) return "BUSY";
      return "MISSED";
    }
    if (durationSec != null && durationSec > 0) return "ANSWERED";
    return "UNKNOWN";
  }

  private extractRecording(raw: KyivstarRawPayload): NormalizedRecording {
    const recordIdRaw = raw.record_id;
    const recordId =
      typeof recordIdRaw === "string" && recordIdRaw.trim() ? recordIdRaw.trim() : undefined;
    if (!recordId) return { status: "PENDING" };
    return {
      recordId,
      url: this.buildRecordingProxyUrl(recordId),
      status: "READY",
    };
  }

  private extractDate(raw: KyivstarRawPayload, keys: string[]): Date | null {
    for (const key of keys) {
      const v = raw[key];
      if (v === undefined || v === null) continue;
      const normalized = String(v).trim().replace(" ", "T");
      const d = new Date(normalized);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  private extractNumber(raw: KyivstarRawPayload, keys: string[]): number | null {
    for (const key of keys) {
      const v = raw[key];
      if (v === undefined || v === null) continue;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }

  private normalizePhone(raw: string | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    if (digits.startsWith("380")) return `+${digits}`;
    if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
    if (digits.length === 9) return `+380${digits}`;
    return `+${digits}`;
  }

  private entityMatchPhoneForInbound(
    direction: NormalizedDirection,
    customerNormalized: string | null,
    managerNormalized: string | null,
  ): string | null {
    if (direction !== "INBOUND" && direction !== "UNKNOWN") return customerNormalized;
    if (!customerNormalized || !managerNormalized) return customerNormalized;
    if (customerNormalized.replace(/\D/g, "") === managerNormalized.replace(/\D/g, "")) {
      return null;
    }
    return customerNormalized;
  }

  private resolveUserIdByPhoneNormalized(
    phonesToUserId: Record<string, string>,
    phoneNormalized: string | null,
  ): string | null {
    if (!phoneNormalized) return null;
    const digits = phoneNormalized.replace(/\D/g, "");
    if (!digits) return null;
    for (const [k, v] of Object.entries(phonesToUserId)) {
      const kd = String(k).replace(/\D/g, "");
      if (kd && kd === digits && typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  }

  private resolveManagerUserIdFromConfig(
    config: { phonesToUserId: Record<string, string>; defaultManagerId: string | null },
    managerPhoneRaw: string | undefined,
  ): string | null {
    const managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);
    const byPhone = this.resolveUserIdByPhoneNormalized(config.phonesToUserId, managerPhoneNormalized);
    if (byPhone) return byPhone;
    return config.defaultManagerId ?? null;
  }

  private phoneNormalizedCandidates(phone: string): string[] {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return [];
    const uniq = new Set<string>();
    uniq.add(digits);
    if (digits.startsWith("380") && digits.length === 12) uniq.add("0" + digits.slice(-9));
    if (digits.startsWith("0") && digits.length === 10) uniq.add("380" + digits.slice(1));
    return [...uniq];
  }

  private async matchOrCreateEntities(
    customerPhoneNormalized: string | null,
    raw: KyivstarRawPayload,
    ownerUserId: string | null,
  ): Promise<{ contactId: string | null; leadId: string | null; companyId: string | null }> {
    if (!customerPhoneNormalized) {
      return { contactId: null, leadId: null, companyId: null };
    }

    const candidates = this.phoneNormalizedCandidates(customerPhoneNormalized);
    const contactByPhone = await this.phoneEntityLookup.findContactByNormalizedKeys(candidates);
    if (contactByPhone) {
      return {
        contactId: contactByPhone.id,
        leadId: null,
        companyId: contactByPhone.companyId ?? null,
      };
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [
          { phoneNormalized: customerPhoneNormalized },
          ...candidates.map((key) => ({ phoneNormalized: key })),
        ],
      },
      select: { id: true, companyId: true, contactId: true },
      orderBy: { createdAt: "desc" },
    });
    if (lead) {
      if (ownerUserId && !lead.contactId) {
        await this.prisma.lead.updateMany({
          where: { id: lead.id, ownerId: null },
          data: { ownerId: ownerUserId },
        });
      }
      return {
        contactId: lead.contactId ?? null,
        leadId: lead.id,
        companyId: lead.companyId,
      };
    }

    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!company) {
      return { contactId: null, leadId: null, companyId: null };
    }

    const companyIdFromPhone = await this.phoneEntityLookup.findCompanyIdByNormalizedKeys(candidates);
    if (companyIdFromPhone) {
      return { contactId: null, leadId: null, companyId: companyIdFromPhone };
    }

    const newLead = await this.prisma.lead.create({
      data: {
        companyId: company.id,
        ownerId: ownerUserId,
        status: LeadStatus.NEW,
        source: LeadSource.KYIVSTAR,
        fullName: customerPhoneNormalized,
        phone: customerPhoneNormalized,
        phoneNormalized: customerPhoneNormalized,
      },
      select: { id: true, companyId: true },
    });

    return { contactId: null, leadId: newLead.id, companyId: newLead.companyId };
  }

  private formatCallStatusLabel(status: string): string {
    const s = status.trim().toUpperCase();
    if (s.includes("MISSED")) return "Пропущено";
    if (s.includes("ANSWER")) return "Відповіли";
    if (s === "BUSY") return "Зайнято";
    if (s === "FAILED") return "Помилка";
    return status;
  }

  buildActivityBody(params: {
    direction: NormalizedDirection;
    status: string;
    durationSec?: number;
    customerPhoneNormalized: string | null;
    hasRecording?: boolean;
  }): string {
    const parts: string[] = [];
    parts.push(`Статус: ${this.formatCallStatusLabel(params.status)}`);
    if (params.direction === "INBOUND") parts.push("Напрямок: вхідний");
    else if (params.direction === "OUTBOUND") parts.push("Напрямок: вихідний");
    else if (params.direction === "LOCAL") parts.push("Напрямок: внутрішній");
    if (params.durationSec != null) parts.push(`Тривалість: ${params.durationSec} сек.`);
    if (params.customerPhoneNormalized) parts.push(`Телефон: ${params.customerPhoneNormalized}`);
    if (params.hasRecording) parts.push("Запис: доступний");
    return parts.join(" · ");
  }

  private async createCallActivity(
    tx: Prisma.TransactionClient,
    callId: string,
    occurredAt: Date,
    params: {
      contactId: string | null;
      companyId: string | null;
      leadId: string | null;
      direction: NormalizedDirection;
      status: string;
      durationSec?: number;
      customerPhoneNormalized: string | null;
      managerUserId: string | null;
    },
  ): Promise<void> {
    const titleParts: string[] = ["Дзвінок"];
    if (params.direction === "INBOUND") titleParts.push("вхідний");
    else if (params.direction === "OUTBOUND") titleParts.push("вихідний");
    else if (params.direction === "LOCAL") titleParts.push("внутрішній");

    await tx.activity.create({
      data: {
        type: ActivityType.CALL,
        title: titleParts.join(" "),
        body: this.buildActivityBody({
          direction: params.direction,
          status: params.status,
          durationSec: params.durationSec,
          customerPhoneNormalized: params.customerPhoneNormalized,
          hasRecording: false,
        }),
        occurredAt,
        createdBy: params.managerUserId ?? "system",
        contactId: params.contactId,
        companyId: params.companyId,
        leadId: params.leadId,
        callId,
      },
    });
  }

  private isMissed(status: string): boolean {
    const s = status.toLowerCase();
    return s.includes("missed") || s.includes("noanswer");
  }

  private async createMissedCallTaskActivity(
    tx: Prisma.TransactionClient,
    params: {
      contactId: string | null;
      companyId: string | null;
      leadId: string | null;
      customerPhoneNormalized: string | null;
      managerUserId: string | null;
      startedAt: Date;
    },
  ): Promise<void> {
    const dueAt = new Date(params.startedAt.getTime() + 2 * 60 * 60 * 1000);
    const bodyLines: string[] = ["Перезвонить клиенту"];
    if (params.customerPhoneNormalized) bodyLines.push(`Телефон: ${params.customerPhoneNormalized}`);
    const body = bodyLines.join("\n");

    if (params.managerUserId && (params.contactId || params.companyId || params.leadId)) {
      await tx.task.create({
        data: {
          assigneeId: params.managerUserId,
          contactId: params.contactId,
          companyId: params.companyId,
          leadId: params.leadId,
          title: "Перезвонить",
          body,
          dueAt,
        },
      });
      return;
    }

    await tx.activity.create({
      data: {
        type: ActivityType.CALL,
        title: "[TODO] Перезвонить",
        body: `[TODO] ${body}`,
        occurredAt: dueAt,
        createdBy: params.managerUserId ?? "system",
        contactId: params.contactId,
        companyId: params.companyId,
      },
    });
  }
}
