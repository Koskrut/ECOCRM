import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ActivityType, LeadSource, LeadStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export const RINGOSTAT_PROVIDER = "RINGOSTAT";

type RingostatRawPayload = Record<string, unknown>;

type NormalizedDirection = "INBOUND" | "OUTBOUND" | "UNKNOWN";

export type RingostatIngestBatchMetrics = {
  total: number;
  processed: number;
  missingUniqueId: number;
  fromEqualsTo: number;
  emptyFrom: number;
  byType: {
    inbound: number;
    outbound: number;
    unknown: number;
  };
};

type RingostatIngestEventMetrics = {
  processed: boolean;
  missingUniqueId: boolean;
  fromEqualsTo: boolean;
  emptyFrom: boolean;
  direction: NormalizedDirection;
};

export type RingostatRecomputedLegs = {
  direction: NormalizedDirection;
  from: string;
  to: string;
  fromNormalized: string | null;
  toNormalized: string | null;
  managerUserId: string | null;
};

/** Get value from root or from additional_call_data (Ringostat Webhooks 2.0). */
function getVal(raw: RingostatRawPayload, key: string): unknown {
  const v = raw[key];
  if (v !== undefined && v !== null) return v;
  const nested = raw["additional_call_data"];
  if (typeof nested === "object" && nested !== null && key in (nested as object)) {
    return (nested as Record<string, unknown>)[key];
  }
  return undefined;
}

type NormalizedRecording = {
  url?: string;
  status: "PENDING" | "READY" | "FAILED";
};

@Injectable()
export class RingostatIngestService {
  private readonly logger = new Logger(RingostatIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  private digitsOnly(v: string): string {
    return (v || "").replace(/\D/g, "");
  }

  private async getRingostatUserMappingConfig(): Promise<{
    extensionsToUserId: Record<string, string>;
    phonesToUserId: Record<string, string>;
    defaultManagerId: string | null;
  }> {
    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
      select: { config: true },
    });
    const cfg = (setting?.config ?? null) as
      | {
          extensionsToUserId?: Record<string, string>;
          phonesToUserId?: Record<string, string>;
          defaultManagerId?: string;
        }
      | null;
    return {
      extensionsToUserId: cfg?.extensionsToUserId ?? {},
      phonesToUserId: cfg?.phonesToUserId ?? {},
      defaultManagerId: cfg?.defaultManagerId ?? null,
    };
  }

  private resolveUserIdByPhoneNormalized(
    phonesToUserId: Record<string, string>,
    phoneNormalized: string | null,
  ): string | null {
    if (!phoneNormalized) return null;
    const digits = this.digitsOnly(phoneNormalized);
    if (!digits) return null;
    for (const [k, v] of Object.entries(phonesToUserId)) {
      const kd = this.digitsOnly(String(k));
      if (kd && kd === digits && typeof v === "string" && v.trim()) {
        return v.trim();
      }
    }
    return null;
  }

  async handleWebhook(body: unknown, providedSecret: string | undefined): Promise<void> {
    await this.assertWebhookSecret(providedSecret);

    await this.ingestFromApi(body);
  }

  /**
   * Public entry point for polling/cron: reuses the same ingestion pipeline as webhook,
   * но без проверки секрета.
   */
  async ingestFromApi(body: unknown): Promise<RingostatIngestBatchMetrics> {
    const events = (Array.isArray(body) ? body : [body]) as RingostatRawPayload[];
    const summary: RingostatIngestBatchMetrics = {
      total: events.length,
      processed: 0,
      missingUniqueId: 0,
      fromEqualsTo: 0,
      emptyFrom: 0,
      byType: { inbound: 0, outbound: 0, unknown: 0 },
    };

    for (const item of events) {
      const m = await this.ingestEvent(item as RingostatRawPayload);
      if (m.processed) summary.processed += 1;
      if (m.missingUniqueId) summary.missingUniqueId += 1;
      if (m.fromEqualsTo) summary.fromEqualsTo += 1;
      if (m.emptyFrom) summary.emptyFrom += 1;
      if (m.direction === "INBOUND") summary.byType.inbound += 1;
      else if (m.direction === "OUTBOUND") summary.byType.outbound += 1;
      else summary.byType.unknown += 1;
    }

    this.logger.log(
      `Ringostat ingest batch: total=${summary.total}, processed=${summary.processed}, type[in=${summary.byType.inbound},out=${summary.byType.outbound},unk=${summary.byType.unknown}], missingUniqueId=${summary.missingUniqueId}, fromEqTo=${summary.fromEqualsTo}, emptyFrom=${summary.emptyFrom}`,
    );

    return summary;
  }

  private async assertWebhookSecret(provided: string | undefined): Promise<void> {
    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
    });

    const expected =
      (setting?.webhookSecret as string | null) ??
      process.env.RINGOSTAT_WEBHOOK_SECRET ??
      null;

    if (!expected || !provided || provided !== expected) {
      this.logger.warn("Ringostat webhook secret mismatch or not configured");
      throw new UnauthorizedException("Invalid Ringostat webhook secret");
    }
  }

  private async ingestEvent(raw: RingostatRawPayload): Promise<RingostatIngestEventMetrics> {
    const direction = this.resolveDirection(raw);
    const hasUniqueId = this.hasStableUniqueId(raw);
    const metrics: RingostatIngestEventMetrics = {
      processed: false,
      missingUniqueId: !hasUniqueId,
      fromEqualsTo: false,
      emptyFrom: false,
      direction,
    };
    try {
      const externalId = this.extractExternalId(raw);
      if (!externalId) {
        this.logger.warn("Ringostat payload without externalId, skipping", { raw });
        return metrics;
      }

      const startedAt = this.extractDate(raw, [
        "started_at",
        "start_time",
        "call_start",
        // Ringostat /calls/list export uses calldate as the call start.
        "calldate",
      ]);
      if (!startedAt) {
        this.logger.warn("Ringostat payload without startedAt, skipping", { externalId });
        return metrics;
      }
      const endedAt = this.extractDate(raw, ["ended_at", "end_time", "call_end"]);
      const durationSec = this.extractDurationSec(raw);

      let status = this.resolveStatus(raw);
      // Ringostat: duration = время до сброса, billsec = фактическое время разговора. Если billsec=0 — никто не говорил, пропущенный.
      const billsec = this.extractNumber(raw, ["billsec"]);
      const waitingSec = this.extractNumber(raw, ["waiting", "waiting_sec", "wait_sec", "wait_time"]);
      const dialogSec = this.extractNumber(raw, ["dialog", "dialog_sec", "talk_sec"]);
      const hasNoTalkTime = billsec !== null ? billsec <= 0 : durationSec !== null && durationSec <= 0;
      if (hasNoTalkTime) {
        status = "MISSED";
      }
      const recording = this.extractRecording(raw);

      let { customerPhoneRaw, managerPhoneRaw, extension } =
        this.extractPhonesAndExtension(raw, direction);

      let customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
      let managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);

      const mapCfg = await this.getRingostatUserMappingConfig();

      // For UNKNOWN (most commonly /calls/list exports), both legs may look like mobile numbers.
      // Use phone->user mapping to infer which leg is the manager line and which is the client.
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
          // Swap: we mistakenly treated manager leg as "customer" — fix before entity match + persistence.
          [customerPhoneRaw, managerPhoneRaw] = [managerPhoneRaw, customerPhoneRaw];
          [customerPhoneNormalized, managerPhoneNormalized] = [managerPhoneNormalized, customerPhoneNormalized];
        }
      }
      metrics.fromEqualsTo =
        !!customerPhoneNormalized &&
        !!managerPhoneNormalized &&
        customerPhoneNormalized.replace(/\D/g, "") === managerPhoneNormalized.replace(/\D/g, "");
      metrics.emptyFrom = !customerPhoneNormalized;

      // Ringostat often sends the same value in E164/dst/connected_with on INBOUND. Matching that
      // to CRM then finds the manager's own Contact (same mobile) — wrong "client" in history.
      let phoneForEntityMatch = this.entityMatchPhoneForInbound(
        direction,
        customerPhoneNormalized,
        managerPhoneNormalized,
      );

      // Never create/link lead/contact by internal (manager) phone numbers.
      // If "customer" leg matches a known manager phone, treat it as non-client.
      const customerAsManagerUserId = this.resolveUserIdByPhoneNormalized(
        mapCfg.phonesToUserId,
        customerPhoneNormalized,
      );
      if (customerAsManagerUserId) {
        phoneForEntityMatch = null;
      }

      const { contactId, leadId, companyId } =
        await this.matchOrCreateEntities(phoneForEntityMatch, raw);

      const managerUserId = this.resolveManagerUserIdFromConfig(
        mapCfg,
        extension,
        managerPhoneNormalized,
      );

      const otherLegUserId = this.resolveUserIdByPhoneNormalized(
        mapCfg.phonesToUserId,
        customerPhoneNormalized,
      );
      const isInternalCall =
        !!managerUserId &&
        !!otherLegUserId &&
        managerUserId !== otherLegUserId;

      const provider = RINGOSTAT_PROVIDER;

      const talkSec =
        billsec !== null
          ? billsec
          : dialogSec !== null
            ? dialogSec
            : durationSec !== null
              ? durationSec
              : null;
      const waitSec =
        waitingSec !== null
          ? waitingSec
          : durationSec !== null && billsec !== null
            ? Math.max(0, durationSec - billsec)
            : null;

      const callData: Prisma.CallUncheckedCreateInput = {
        provider,
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
        meta: { talkSec, waitingSec: waitSec, isInternalCall } as Prisma.InputJsonValue,
        rawPayload: raw as Prisma.JsonObject,
        contactId: contactId ?? null,
        leadId: leadId ?? null,
        companyId: companyId ?? null,
        managerUserId: managerUserId ?? null,
      };

      await this.prisma.$transaction(async (tx) => {
        const call = await tx.call.upsert({
          where: {
            provider_externalId: {
              provider,
              externalId,
            },
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
            rawPayload: callData.rawPayload,
          },
        });

        // Create Activity only on first insert (no call.id in old data).
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
        } else {
          // Enrich existing activity: link to lead/contact/company if call has them (so the creating call appears in lead timeline).
          const updatePayload: Record<string, unknown> = {};
          if (call.leadId != null && existingActivity.leadId !== call.leadId) updatePayload.leadId = call.leadId;
          if (call.contactId != null && existingActivity.contactId !== call.contactId) updatePayload.contactId = call.contactId;
          if (call.companyId != null && existingActivity.companyId !== call.companyId) updatePayload.companyId = call.companyId;
          if (recording.url) {
            updatePayload.body = this.buildActivityBody({
              direction,
              status,
              durationSec: call.durationSec ?? undefined,
              customerPhoneNormalized,
              hasRecording: true,
            });
          }
          if (Object.keys(updatePayload).length > 0) {
            await tx.activity.updateMany({
              where: { callId: call.id },
              data: updatePayload as Prisma.ActivityUpdateManyMutationInput,
            });
          }
        }

        if (this.isMissed(status) && customerPhoneNormalized) {
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

      this.logger.log(
        `Ringostat call ingested: externalId=${externalId}, direction=${direction}, status=${status}`,
      );
      metrics.processed = true;
      return metrics;
    } catch (e) {
      this.logger.error("Failed to ingest Ringostat event", e instanceof Error ? e.stack : String(e));
      return metrics;
    }
  }

  private hasStableUniqueId(raw: RingostatRawPayload): boolean {
    const v = getVal(raw, "uniqueid");
    return typeof v === "string" && v.trim().length > 0;
  }

  private extractExternalId(raw: RingostatRawPayload): string | null {
    const keys = ["call_id", "id", "uuid", "callId", "external_id", "uniqueid"];
    for (const key of keys) {
      const v = getVal(raw, key);
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }

    // Fallback for Ringostat /calls/list payload when no uniqueid/id is present.
    const caller =
      getVal(raw, "caller") ??
      getVal(raw, "src") ??
      getVal(raw, "E164") ??
      getVal(raw, "connected_with") ??
      getVal(raw, "userfield");
    const callee =
      getVal(raw, "callee") ??
      getVal(raw, "dst") ??
      getVal(raw, "outbound_number") ??
      getVal(raw, "connected_to");
    const calldate = getVal(raw, "calldate");
    if (typeof caller === "string" && caller.trim() && typeof calldate === "string" && calldate.trim()) {
      return this.buildSyntheticExternalId(raw, caller, callee, calldate);
    }

    return null;
  }

  private buildSyntheticExternalId(
    raw: RingostatRawPayload,
    caller: string,
    callee: unknown,
    calldate: string,
  ): string {
    const norm = (v: unknown): string => String(v ?? "").trim().replace(/\s+/g, "");
    const parts = [
      "syn",
      norm(getVal(raw, "type") ?? getVal(raw, "direction") ?? "unknown"),
      norm(caller),
      norm(callee),
      norm(getVal(raw, "dst")),
      norm(getVal(raw, "billsec")),
      norm(getVal(raw, "disposition")),
      norm(calldate),
    ];
    return parts.join("|");
  }

  async recomputeLegsFromRaw(raw: unknown): Promise<RingostatRecomputedLegs | null> {
    if (!raw || typeof raw !== "object") return null;
    const payload = raw as RingostatRawPayload;
    const direction = this.resolveDirection(payload);
    let { customerPhoneRaw, managerPhoneRaw, extension } =
      this.extractPhonesAndExtension(payload, direction);
    let customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
    let managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);

    const mapCfg = await this.getRingostatUserMappingConfig();
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
        [customerPhoneRaw, managerPhoneRaw] = [managerPhoneRaw, customerPhoneRaw];
        [customerPhoneNormalized, managerPhoneNormalized] = [managerPhoneNormalized, customerPhoneNormalized];
      }
    }

    const managerUserId = this.resolveManagerUserIdFromConfig(
      mapCfg,
      extension,
      managerPhoneNormalized,
    );

    return {
      direction,
      from: customerPhoneRaw ?? "",
      to: managerPhoneRaw ?? "",
      fromNormalized: customerPhoneNormalized,
      toNormalized: managerPhoneNormalized,
      managerUserId: managerUserId ?? null,
    };
  }

  private extractDate(raw: RingostatRawPayload, keys: string[]): Date | null {
    for (const key of keys) {
      const v = getVal(raw, key);
      if (v === undefined || v === null) continue;
      const d = new Date(String(v));
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  }

  private extractNumber(raw: RingostatRawPayload, keys: string[]): number | null {
    for (const key of keys) {
      const v = getVal(raw, key);
      if (v === undefined || v === null) continue;
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
    return null;
  }

  private extractDurationSec(raw: RingostatRawPayload): number | null {
    return this.extractNumber(raw, ["duration", "duration_sec", "billsec"]);
  }

  /**
   * Ringostat Webhooks 2.0 (Knowledge Base):
   * - Incoming call event: `"type":"in"`
   * - Outbound call event: `"type":"out"`
   * @see https://help.ringostat.com/en/articles/6559993-webhooks-incoming-call-event
   * @see https://help.ringostat.com/en/articles/6583751-webhooks-outbound-call-event
   *
   * Важливо: не використовувати `??` для ланцюжка direction/type — порожній рядок у `direction`
   * блокував би читання `type` і вихідні дзвінки з `caller` потрапляли б в fallback як INBOUND.
   */
  private resolveDirection(raw: RingostatRawPayload): NormalizedDirection {
    const typeVal = String(getVal(raw, "type") ?? "").trim().toLowerCase();
    if (typeVal === "in") return "INBOUND";
    if (typeVal === "out") return "OUTBOUND";

    const rawDir = this.ringostatFirstNonEmptyString(
      getVal(raw, "direction"),
      getVal(raw, "call_direction"),
      getVal(raw, "call_type"),
      getVal(raw, "ai_call_type"),
    ).toLowerCase();

    if (["in", "inbound", "incoming"].some((k) => rawDir.includes(k))) return "INBOUND";
    if (["out", "outbound", "outgoing"].some((k) => rawDir.includes(k))) return "OUTBOUND";

    // Polling /calls/list exports can omit explicit type/direction.
    // Prefer outbound hints (so we don't mask outgoing as inbound).
    const outboundNumber = String(getVal(raw, "outbound_number") ?? "").trim();
    if (outboundNumber) return "OUTBOUND";

    const callee = String(
      (getVal(raw, "callee") ??
        getVal(raw, "destination") ??
        getVal(raw, "connected_to") ??
        "") as string,
    ).trim();
    const caller = String((getVal(raw, "caller") ?? getVal(raw, "src") ?? getVal(raw, "from") ?? "") as string).trim();
    const dst = String((getVal(raw, "dst") ?? getVal(raw, "to") ?? "") as string).trim();

    const digitsLen = (v: string) => (v || "").replace(/\D/g, "").length;
    const callerLen = digitsLen(caller);
    const calleeLen = digitsLen(callee);
    const dstLen = digitsLen(dst);
    const extMax = 6; // short internal extension / line alias
    const phoneMin = 9; // external phone is usually >=9 digits in exports

    // If we can see both sides, infer by which looks like an external phone number.
    if (callerLen > 0 && calleeLen > 0) {
      if (callerLen <= extMax && calleeLen >= phoneMin) return "OUTBOUND";
      if (callerLen >= phoneMin && calleeLen <= extMax) return "INBOUND";
    }
    if (callerLen > 0 && dstLen > 0) {
      if (callerLen <= extMax && dstLen >= phoneMin) return "OUTBOUND";
      if (callerLen >= phoneMin && dstLen <= extMax) return "INBOUND";
    }

    return "UNKNOWN";
  }

  private ringostatFirstNonEmptyString(...vals: unknown[]): string {
    for (const v of vals) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s.length > 0) return s;
    }
    return "";
  }

  private resolveStatus(raw: RingostatRawPayload): string {
    const rawStatus = String(
      (getVal(raw, "status") ??
        getVal(raw, "call_status") ??
        getVal(raw, "call_result") ??
        getVal(raw, "result") ??
        getVal(raw, "disposition") ??
        "") as string
    ).toLowerCase();

    if (!rawStatus) return "UNKNOWN";
    if (["answered", "answer", "connected"].some((k) => rawStatus.includes(k))) return "ANSWERED";
    if (
      [
        "noanswer",
        "no answer",
        "no-answer",
        "no_answer",
        "missed",
        "not answered",
      ].some((k) => rawStatus.includes(k))
    ) {
      // Нормализуем все варианты «нет ответа» / «пропущен» в единый статус MISSED,
      // чтобы с ним было проще работать в UI и агрегациях.
      return "MISSED";
    }
    if (rawStatus.includes("busy")) return "BUSY";
    if (rawStatus.includes("failed") || rawStatus.includes("error")) return "FAILED";
    return rawStatus.toUpperCase();
  }

  private extractRecording(raw: RingostatRawPayload): NormalizedRecording {
    const rec = getVal(raw, "recording");
    const urlCandidate =
      (typeof rec === "string" && rec.trim().length > 0
        ? rec
        : typeof rec === "object" && rec !== null && rec && "url" in rec
          ? (rec as { url?: string }).url
          : null) ??
      getVal(raw, "record_url") ??
      getVal(raw, "recording_url") ??
      getVal(raw, "recordingUrl") ??
      getVal(raw, "record_file") ??
      getVal(raw, "recording_wav") ??
      null;

    let url = urlCandidate ? String(urlCandidate).trim() : undefined;
    // CRM runs on https; http recording URLs are blocked by browsers as mixed content.
    if (url && url.startsWith("http://")) {
      url = "https://" + url.slice("http://".length);
    }
    if (url && url.length > 0) {
      return { url, status: "READY" };
    }

    const statusRaw = String(
      (getVal(raw, "recording_status") ??
        getVal(raw, "record_status") ??
        (typeof rec === "object" && rec !== null && rec && "status" in rec
          ? (rec as { status?: string }).status
          : "")) as string,
    ).toLowerCase();

    if (statusRaw.includes("failed") || statusRaw.includes("error")) {
      return { status: "FAILED" };
    }
    if (statusRaw.includes("ready") || statusRaw.includes("done") || getVal(raw, "has_recording") === true) {
      return { status: "PENDING" };
    }
    if (getVal(raw, "has_recording") === "1" || getVal(raw, "has_recording") === 1) {
      return { status: "PENDING" };
    }

    return { status: "PENDING" };
  }

  private extractPhonesAndExtension(
    raw: RingostatRawPayload,
    direction: NormalizedDirection,
  ): {
    customerPhoneRaw?: string;
    managerPhoneRaw?: string;
    extension?: string;
  } {
    // INBOUND: never treat outbound_number / pool line as the client — Ringostat often sends it
    // alongside E164/connected_with; picking it first wrongly matched contacts to the company number.
    const inboundCustomerRaw =
      this.ringostatFirstNonEmptyString(
        getVal(raw, "src"),
        getVal(raw, "from"),
        getVal(raw, "caller"),
        getVal(raw, "E164"),
        getVal(raw, "connected_with"),
        getVal(raw, "userfield"),
      ).trim() || undefined;

    const src =
      String(
        (getVal(raw, "src") ??
          getVal(raw, "from") ??
          getVal(raw, "caller") ??
          getVal(raw, "outbound_number") ??
          getVal(raw, "E164") ??
          getVal(raw, "connected_with") ??
          getVal(raw, "userfield") ??
          "") as string,
      ) || undefined;
    const dst =
      String(
        (getVal(raw, "dst") ??
          getVal(raw, "to") ??
          getVal(raw, "callee") ??
          getVal(raw, "n_alias") ??
          "") as string,
      ) || undefined;
    const callee =
      String(
        (getVal(raw, "callee") ??
          getVal(raw, "destination") ??
          getVal(raw, "connected_to") ??
          "") as string,
      ) || undefined;
    const outboundNumber = String((getVal(raw, "outbound_number") ?? "") as string) || undefined;
    const ext =
      (getVal(raw, "sip_extension") ??
        getVal(raw, "extension") ??
        getVal(raw, "extension_number") ??
        getVal(raw, "user") ??
        getVal(raw, "line") ??
        getVal(raw, "agent") ??
        getVal(raw, "n_alias")) ?? undefined;

    let customerPhoneRaw: string | undefined;
    let managerPhoneRaw: string | undefined;

    if (direction === "INBOUND") {
      customerPhoneRaw = inboundCustomerRaw;
      const custNorm = this.normalizePhone(customerPhoneRaw);
      let mgrDst = dst || undefined;
      let mgrDstWasSameAsCustomer = false;
      const dstNorm = mgrDst ? this.normalizePhone(mgrDst) : null;
      if (mgrDst && custNorm && dstNorm && dstNorm === custNorm) {
        // Ringostat sometimes repeats the client number in dst; do not treat it as the manager leg.
        mgrDst = undefined;
        mgrDstWasSameAsCustomer = true;
      }
      managerPhoneRaw = mgrDst || outboundNumber || undefined;
      if (!managerPhoneRaw && mgrDstWasSameAsCustomer && customerPhoneRaw) {
        // When both legs collapse to the same number and Ringostat doesn't provide outbound_number,
        // treat manager leg as identical so entity matching can be safely skipped for inbound.
        managerPhoneRaw = customerPhoneRaw;
      }
    } else if (direction === "OUTBOUND") {
      customerPhoneRaw = callee || dst;
      managerPhoneRaw = outboundNumber || src;
    } else {
      // UNKNOWN: /calls/list often omits type/direction — infer client vs internal line by digit length.
      const inboundChain = this.ringostatFirstNonEmptyString(
        getVal(raw, "src"),
        getVal(raw, "from"),
        getVal(raw, "caller"),
        getVal(raw, "E164"),
        getVal(raw, "connected_with"),
        getVal(raw, "userfield"),
      ).trim();
      const dstChain = this.ringostatFirstNonEmptyString(
        getVal(raw, "dst"),
        getVal(raw, "to"),
        getVal(raw, "callee"),
        callee ?? "",
      ).trim();

      const digitsLen = (v: string) => v.replace(/\D/g, "").length;
      const extMax = 6;
      const phoneMin = 9;
      const iLen = digitsLen(inboundChain);
      const dLen = digitsLen(dstChain);

      if (inboundChain && dstChain) {
        if (iLen >= phoneMin && dLen <= extMax) {
          customerPhoneRaw = inboundChain;
          managerPhoneRaw = dstChain;
        } else if (dLen >= phoneMin && iLen <= extMax) {
          customerPhoneRaw = dstChain;
          managerPhoneRaw = inboundChain;
        } else {
          customerPhoneRaw = inboundChain || undefined;
          managerPhoneRaw =
            dstChain !== inboundChain ? dstChain : outboundNumber ? String(outboundNumber).trim() : undefined;
        }
      } else {
        customerPhoneRaw = inboundChain || dstChain || undefined;
        managerPhoneRaw =
          (dstChain && dstChain !== inboundChain ? dstChain : undefined) ||
          (inboundChain && inboundChain !== dstChain ? inboundChain : undefined) ||
          (outboundNumber ? String(outboundNumber).trim() : undefined);
      }
    }

    return {
      customerPhoneRaw,
      managerPhoneRaw,
      extension: ext ? String(ext) : undefined,
    };
  }

  private normalizePhone(raw: string | undefined): string | null {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;

    // UA-specific: ensure +380... format
    if (digits.startsWith("380")) {
      return `+${digits}`;
    }
    if (digits.length === 10 && digits.startsWith("0")) {
      return `+38${digits}`;
    }
    if (digits.length === 9) {
      return `+380${digits}`;
    }
    return `+${digits}`;
  }

  /**
   * If INBOUND (or UNKNOWN list export) duplicates one number for both legs, do not link Contact/Lead by it
   * (avoids showing a staff contact as the "client" in call history).
   */
  private entityMatchPhoneForInbound(
    direction: NormalizedDirection,
    customerNormalized: string | null,
    managerNormalized: string | null,
  ): string | null {
    if (direction !== "INBOUND" && direction !== "UNKNOWN") return customerNormalized;
    if (!customerNormalized || !managerNormalized) return customerNormalized;
    const c = customerNormalized.replace(/\D/g, "");
    const m = managerNormalized.replace(/\D/g, "");
    if (!c || !m) return customerNormalized;
    if (c === m) {
      this.logger.debug(
        "Ringostat INBOUND: customer and manager phone identical in payload, skip entity match",
      );
      return null;
    }
    return customerNormalized;
  }

  /** Return possible phoneNormalized values to try (e.g. 380931112233 and 0931112233). */
  private phoneNormalizedCandidates(phone: string): string[] {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return [];
    const uniq = new Set<string>();
    uniq.add(digits);
    if (digits.startsWith("380") && digits.length === 12) {
      uniq.add("0" + digits.slice(-9));
    }
    if (digits.startsWith("0") && digits.length === 10) {
      uniq.add("380" + digits.slice(1));
    }
    return [...uniq];
  }

  private async matchOrCreateEntities(
    customerPhoneNormalized: string | null,
    raw: RingostatRawPayload,
  ): Promise<{ contactId: string | null; leadId: string | null; companyId: string | null }> {
    if (!customerPhoneNormalized) {
      return { contactId: null, leadId: null, companyId: null };
    }

    const candidates = this.phoneNormalizedCandidates(customerPhoneNormalized);

    // 1) Try to find Contact by primary or additional phone (same candidate formats).
    for (const key of candidates) {
      const contact = await this.prisma.contact.findFirst({
        where: {
          OR: [
            { phoneNormalized: key },
            { phones: { some: { phoneNormalized: key } } },
          ],
        },
        select: { id: true, companyId: true },
      });
      if (contact) {
        return {
          contactId: contact.id,
          leadId: null,
          companyId: contact.companyId ?? null,
        };
      }
    }

    // 1b) Fallback: contacts with phoneNormalized null (e.g. legacy) — match by phone field.
    const candidateSet = new Set(candidates);
    const contactsWithoutNormalized = await this.prisma.contact.findMany({
      where: { phoneNormalized: null, phone: { not: "" } },
      select: { id: true, companyId: true, phone: true },
      take: 500,
    });
    for (const c of contactsWithoutNormalized) {
      const cCandidates = this.phoneNormalizedCandidates(c.phone || "");
      if (cCandidates.some((k) => candidateSet.has(k))) {
        return {
          contactId: c.id,
          leadId: null,
          companyId: c.companyId ?? null,
        };
      }
    }

    // 2) Try to find Lead by normalized phone (try +380, 380, 0... formats).
    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [
          { phoneNormalized: customerPhoneNormalized },
          ...candidates.map((key) => ({ phoneNormalized: key })),
        ].filter((x) => Object.values(x)[0] != null),
      },
      select: { id: true, companyId: true, contactId: true },
      orderBy: { createdAt: "desc" },
    });
    if (lead) {
      return {
        contactId: lead.contactId ?? null,
        leadId: lead.id,
        companyId: lead.companyId,
      };
    }

    // 3) Create new Lead with minimal info, using first company as owner.
    const company = await this.prisma.company.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!company) {
      this.logger.warn("No company found while creating lead for Ringostat call");
      return { contactId: null, leadId: null, companyId: null };
    }

    const name =
      (raw["client_name"] as string | undefined) ??
      (raw["caller_name"] as string | undefined) ??
      customerPhoneNormalized;

    const newLead = await this.prisma.lead.create({
      data: {
        companyId: company.id,
        status: LeadStatus.NEW,
        source: LeadSource.OTHER,
        fullName: name,
        phone: customerPhoneNormalized,
        phoneNormalized: customerPhoneNormalized,
      },
      select: { id: true, companyId: true },
    });

    return {
      contactId: null,
      leadId: newLead.id,
      companyId: newLead.companyId,
    };
  }

  /** Manager = mapping from Ringostat extension (settings) or defaultManagerId fallback only. */
  private resolveManagerUserIdFromConfig(
    config: {
      extensionsToUserId: Record<string, string>;
      phonesToUserId: Record<string, string>;
      defaultManagerId: string | null;
    },
    extension: string | undefined,
    managerPhoneNormalized: string | null,
  ): string | null {
    if (extension && config.extensionsToUserId?.[extension]) {
      return config.extensionsToUserId[extension];
    }
    const byPhone = this.resolveUserIdByPhoneNormalized(config.phonesToUserId, managerPhoneNormalized);
    if (byPhone) return byPhone;
    return config.defaultManagerId ?? null;
  }

  private buildActivityBody(params: {
    direction: NormalizedDirection;
    status: string;
    durationSec?: number;
    customerPhoneNormalized: string | null;
    hasRecording?: boolean;
  }): string {
    const parts: string[] = [];
    parts.push(`Статус: ${params.status}`);
    if (params.direction !== "UNKNOWN") {
      parts.push(`Направление: ${params.direction === "INBOUND" ? "входящий" : "исходящий"}`);
    }
    if (params.durationSec != null) {
      parts.push(`Длительность: ${params.durationSec} сек.`);
    }
    if (params.customerPhoneNormalized) {
      parts.push(`Телефон: ${params.customerPhoneNormalized}`);
    }
    if (params.hasRecording) {
      parts.push("Запись: доступна");
    }
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
    const titleParts: string[] = ["Звонок"];
    if (params.direction === "INBOUND") titleParts.push("входящий");
    else if (params.direction === "OUTBOUND") titleParts.push("исходящий");

    const title = titleParts.join(" ");

    const body = this.buildActivityBody({
      direction: params.direction,
      status: params.status,
      durationSec: params.durationSec,
      customerPhoneNormalized: params.customerPhoneNormalized,
      hasRecording: false,
    });

    await tx.activity.create({
      data: {
        type: ActivityType.CALL,
        title,
        body,
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
    return (
      s.includes("missed") ||
      s.includes("noanswer") ||
      s.includes("no answer") ||
      s.includes("no_answer") ||
      s.includes("no-answer") ||
      s.includes("not_answered")
    );
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
    if (params.customerPhoneNormalized) {
      bodyLines.push(`Телефон: ${params.customerPhoneNormalized}`);
    }
    const body = bodyLines.join("\n");

    const hasEntity =
      params.contactId != null || params.companyId != null || params.leadId != null;
    const hasAssignee = params.managerUserId != null;

    if (hasAssignee && hasEntity) {
      await tx.task.create({
        data: {
          assigneeId: params.managerUserId!,
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

    // Fallback: create timeline activity when no assignee or no linked entity
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

