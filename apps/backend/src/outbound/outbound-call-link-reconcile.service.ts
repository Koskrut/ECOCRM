import { Injectable, Logger } from "@nestjs/common";
import { OutboundAttemptStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { RINGOSTAT_PROVIDER } from "../integrations/ringostat/ringostat-ingest.service";

type AttemptRow = {
  id: string;
  phoneNormalized: string;
  contactId: string | null;
  leadId: string | null;
  updatedAt: Date;
};

@Injectable()
export class OutboundCallLinkReconcileService {
  private readonly logger = new Logger(OutboundCallLinkReconcileService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Safe-mode delayed linking: phone + time window + optional contact/lead match.
   * Skips on ambiguity, existing callId, or Call already bound to another attempt.
   */
  async reconcileUnlinkedAttempts(): Promise<number> {
    const batch = Math.min(
      200,
      Math.max(1, Number.parseInt(process.env.OUTBOUND_LINK_RECONCILE_BATCH ?? "50", 10) || 50),
    );
    const windowMin = Math.min(
      24 * 60,
      Math.max(5, Number.parseInt(process.env.OUTBOUND_CALL_LINK_WINDOW_MINUTES ?? "90", 10) || 90),
    );
    const maxAgeH = Math.min(
      168,
      Math.max(1, Number.parseInt(process.env.OUTBOUND_LINK_RECONCILE_MAX_AGE_HOURS ?? "72", 10) || 72),
    );
    const provider = (
      process.env.OUTBOUND_LINK_RECONCILE_PROVIDER ?? RINGOSTAT_PROVIDER
    )
      .trim()
      .toUpperCase();

    const maxAgeCutoff = new Date(Date.now() - maxAgeH * 60 * 60 * 1000);

    const attempts = await this.prisma.outboundCallAttempt.findMany({
      where: {
        callId: null,
        status: { in: [OutboundAttemptStatus.DIALING, OutboundAttemptStatus.COMPLETED] },
        updatedAt: { gte: maxAgeCutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: batch,
      select: {
        id: true,
        phoneNormalized: true,
        contactId: true,
        leadId: true,
        updatedAt: true,
      },
    });

    let linked = 0;
    for (const a of attempts) {
      const r = await this.tryLinkOne(a, provider, windowMin);
      if (r === "linked") linked += 1;
    }
    return linked;
  }

  private async tryLinkOne(
    attempt: AttemptRow,
    provider: string,
    windowMinutes: number,
  ): Promise<"linked" | "skipped"> {
    const halfMs = windowMinutes * 60 * 1000;
    const anchor = attempt.updatedAt.getTime();
    const windowStart = new Date(anchor - halfMs);
    const windowEnd = new Date(anchor + halfMs);

    const phoneOr: { fromNormalized?: string; toNormalized?: string }[] = [
      { fromNormalized: attempt.phoneNormalized },
      { toNormalized: attempt.phoneNormalized },
    ];

    const andFilters: Prisma.CallWhereInput[] = [
      { provider },
      { startedAt: { gte: windowStart, lte: windowEnd } },
      { OR: phoneOr },
    ];

    if (attempt.contactId) {
      andFilters.push({ contactId: attempt.contactId });
    }
    if (attempt.leadId) {
      andFilters.push({ leadId: attempt.leadId });
    }

    const candidates = await this.prisma.call.findMany({
      where: { AND: andFilters },
      select: { id: true },
      orderBy: { startedAt: "asc" },
      take: 2,
    });

    if (candidates.length === 0) {
      this.logger.debug(
        `Outbound reconcile skip attempt=${attempt.id}: no Call candidates (provider=${provider}, windowMin=${windowMinutes})`,
      );
      return "skipped";
    }

    if (candidates.length > 1) {
      this.logger.warn(
        `Outbound reconcile skip attempt=${attempt.id}: ambiguous Call candidates count=${candidates.length} (safe mode)`,
      );
      return "skipped";
    }

    const callId = candidates[0].id;

    const otherAttempt = await this.prisma.outboundCallAttempt.findFirst({
      where: { callId, NOT: { id: attempt.id } },
      select: { id: true },
    });
    if (otherAttempt) {
      this.logger.warn(
        `Outbound reconcile skip attempt=${attempt.id}: Call ${callId} already linked to attempt=${otherAttempt.id}`,
      );
      return "skipped";
    }

    const upd = await this.prisma.outboundCallAttempt.updateMany({
      where: { id: attempt.id, callId: null },
      data: { callId },
    });

    if (upd.count === 0) {
      this.logger.debug(`Outbound reconcile skip attempt=${attempt.id}: callId already set (race)`);
      return "skipped";
    }

    this.logger.log(`Outbound reconcile linked attempt=${attempt.id} -> callId=${callId}`);
    return "linked";
  }
}
