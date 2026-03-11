import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ActivityType, LeadSource, LeadStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export const RINGOSTAT_PROVIDER = "RINGOSTAT";

type RingostatRawPayload = Record<string, unknown>;

type NormalizedDirection = "INBOUND" | "OUTBOUND" | "UNKNOWN";

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

  async handleWebhook(body: unknown, providedSecret: string | undefined): Promise<void> {
    await this.assertWebhookSecret(providedSecret);

    await this.ingestFromApi(body);
  }

  /**
   * Public entry point for polling/cron: reuses the same ingestion pipeline as webhook,
   * но без проверки секрета.
   */
  async ingestFromApi(body: unknown): Promise<void> {
    if (Array.isArray(body)) {
      for (const item of body) {
        await this.ingestEvent(item as RingostatRawPayload);
      }
    } else {
      await this.ingestEvent(body as RingostatRawPayload);
    }
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

  private async ingestEvent(raw: RingostatRawPayload): Promise<void> {
    try {
      const externalId = this.extractExternalId(raw);
      if (!externalId) {
        this.logger.warn("Ringostat payload without externalId, skipping", { raw });
        return;
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
        return;
      }
      const endedAt = this.extractDate(raw, ["ended_at", "end_time", "call_end"]);
      const durationSec = this.extractDurationSec(raw);

      const direction = this.resolveDirection(raw);
      let status = this.resolveStatus(raw);
      // Ringostat: duration = время до сброса, billsec = фактическое время разговора. Если billsec=0 — никто не говорил, пропущенный.
      const billsec = this.extractNumber(raw, ["billsec"]);
      const hasNoTalkTime = billsec !== null ? billsec <= 0 : durationSec !== null && durationSec <= 0;
      if (hasNoTalkTime) {
        status = "MISSED";
      }
      const recording = this.extractRecording(raw);

      const { customerPhoneRaw, managerPhoneRaw, extension } =
        this.extractPhonesAndExtension(raw, direction);

      const customerPhoneNormalized = this.normalizePhone(customerPhoneRaw);
      const managerPhoneNormalized = this.normalizePhone(managerPhoneRaw);

      const { contactId, leadId, companyId } =
        await this.matchOrCreateEntities(customerPhoneNormalized, raw);

      const managerUserId = await this.resolveManagerUserId(extension, managerPhoneNormalized);

      const provider = RINGOSTAT_PROVIDER;

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
          select: { id: true },
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
          // Optionally enrich existing activity with recording info later.
          await tx.activity.updateMany({
            where: { callId: call.id },
            data: {
              body: {
                set: this.buildActivityBody({
                  direction,
                  status,
                  durationSec: call.durationSec ?? undefined,
                  customerPhoneNormalized,
                  hasRecording: true,
                }),
              },
            },
          });
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
    } catch (e) {
      this.logger.error("Failed to ingest Ringostat event", e instanceof Error ? e.stack : String(e));
    }
  }

  private extractExternalId(raw: RingostatRawPayload): string | null {
    const keys = ["call_id", "id", "uuid", "callId", "external_id", "uniqueid"];
    for (const key of keys) {
      const v = getVal(raw, key);
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }

    // Fallback for Ringostat /calls/list payload: use caller + calldate as a synthetic ID.
    const caller = getVal(raw, "caller") ?? getVal(raw, "E164") ?? getVal(raw, "connected_with") ?? getVal(raw, "userfield");
    const calldate = getVal(raw, "calldate");
    if (typeof caller === "string" && caller.trim() && typeof calldate === "string" && calldate.trim()) {
      return `${caller.trim()}_${calldate.trim()}`;
    }

    return null;
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

  private resolveDirection(raw: RingostatRawPayload): NormalizedDirection {
    const rawDir = String(
      (getVal(raw, "direction") ??
        getVal(raw, "call_direction") ??
        getVal(raw, "call_type") ??
        getVal(raw, "type") ??
        getVal(raw, "ai_call_type") ??
        "") as string,
    ).toLowerCase();

    if (["in", "inbound", "incoming"].some((k) => rawDir.includes(k))) return "INBOUND";
    if (["out", "outbound", "outgoing"].some((k) => rawDir.includes(k))) return "OUTBOUND";

    // Fallback for /calls/list payload where we only know the caller:
    if (getVal(raw, "caller") ?? getVal(raw, "E164") ?? getVal(raw, "connected_with")) return "INBOUND";

    return "UNKNOWN";
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

    const url = urlCandidate ? String(urlCandidate).trim() : undefined;
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
    const src = String((getVal(raw, "src") ?? getVal(raw, "from") ?? getVal(raw, "caller") ?? getVal(raw, "E164") ?? getVal(raw, "connected_with") ?? getVal(raw, "userfield") ?? "") as string) || undefined;
    const dst = String((getVal(raw, "dst") ?? getVal(raw, "to") ?? getVal(raw, "n_alias") ?? "") as string) || undefined;
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
      customerPhoneRaw = src;
      managerPhoneRaw = dst;
    } else if (direction === "OUTBOUND") {
      customerPhoneRaw = dst;
      managerPhoneRaw = src;
    } else {
      customerPhoneRaw = src || dst;
      managerPhoneRaw = dst || src;
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

    // 1) Try to find Contact by normalized phone (try 380... and 0... formats).
    for (const key of candidates) {
      const contact = await this.prisma.contact.findUnique({
        where: { phoneNormalized: key },
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

  private async resolveManagerUserId(
    extension: string | undefined,
    managerPhoneNormalized: string | null,
  ): Promise<string | null> {
    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: RINGOSTAT_PROVIDER },
      select: { config: true },
    });
    const config = (setting?.config ?? null) as
      | {
          extensionsToUserId?: Record<string, string>;
          defaultManagerId?: string;
        }
      | null;

    if (extension && config?.extensionsToUserId?.[extension]) {
      return config.extensionsToUserId[extension];
    }

    if (managerPhoneNormalized) {
      const user = await this.prisma.user.findFirst({
        where: { email: { contains: managerPhoneNormalized, mode: "insensitive" } },
        select: { id: true },
      });
      if (user) return user.id;
    }

    return config?.defaultManagerId ?? null;
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

