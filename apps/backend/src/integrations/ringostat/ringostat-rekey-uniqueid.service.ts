import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RINGOSTAT_PROVIDER } from "./ringostat-ingest.service";

export type RingostatRekeyUniqueidParams = {
  from: string;
  to: string;
  dryRun?: boolean;
  limit?: number;
};

export type RingostatRekeyUniqueidReport = {
  dryRun: boolean;
  scanned: number;
  matched: number;
  merged: number;
  skipped: number;
  from: string;
  to: string;
  limit: number;
};

type CallRow = {
  id: string;
  externalId: string;
  startedAt: Date;
  direction: string;
  status: string;
  durationSec: number | null;
  from: string;
  to: string;
  fromNormalized: string | null;
  toNormalized: string | null;
  rawPayload: Prisma.JsonValue;
  recordingUrl: string | null;
  activity: { id: string } | null;
  outboundCallAttempt: { id: string } | null;
  manualCallSessions: { id: string }[];
};

@Injectable()
export class RingostatRekeyUniqueidService {
  private readonly logger = new Logger(RingostatRekeyUniqueidService.name);

  constructor(private readonly prisma: PrismaService) {}

  async rekey(params: RingostatRekeyUniqueidParams): Promise<RingostatRekeyUniqueidReport> {
    const dryRun = params.dryRun !== false;
    const limit = Math.max(1, Math.min(params.limit ?? 5000, 50_000));

    const fromDate = new Date(params.from);
    const toDate = new Date(params.to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid from/to date");
    }
    if (fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException("from must be <= to");
    }

    const rows = (await this.prisma.call.findMany({
      where: {
        provider: RINGOSTAT_PROVIDER,
        startedAt: { gte: fromDate, lte: toDate },
      },
      select: {
        id: true,
        externalId: true,
        startedAt: true,
        direction: true,
        status: true,
        durationSec: true,
        from: true,
        to: true,
        fromNormalized: true,
        toNormalized: true,
        rawPayload: true,
        recordingUrl: true,
        activity: { select: { id: true } },
        outboundCallAttempt: { select: { id: true } },
        manualCallSessions: { select: { id: true } },
      },
      orderBy: { startedAt: "desc" },
      take: limit,
    })) as unknown as CallRow[];

    const getUniqueid = (raw: Prisma.JsonValue): string | null => {
      if (!raw || typeof raw !== "object") return null;
      const v = (raw as Record<string, unknown>).uniqueid;
      const s = v == null ? "" : String(v).trim();
      return s.length > 0 ? s : null;
    };

    const digits = (v: string | null | undefined): string => String(v ?? "").replace(/\D/g, "");
    const toStr = (raw: Prisma.JsonValue, key: string): string => {
      if (!raw || typeof raw !== "object") return "";
      const v = (raw as Record<string, unknown>)[key];
      return v == null ? "" : String(v).trim();
    };
    const extractDigitsSet = (r: CallRow): Set<string> => {
      const out = new Set<string>();
      const push = (s: string) => {
        const d = digits(s);
        if (d.length >= 6) out.add(d);
      };
      push(r.fromNormalized ?? r.from);
      push(r.toNormalized ?? r.to);
      push(toStr(r.rawPayload, "caller"));
      push(toStr(r.rawPayload, "dst"));
      push(toStr(r.rawPayload, "callee"));
      push(toStr(r.rawPayload, "src"));
      push(toStr(r.rawPayload, "E164"));
      push(toStr(r.rawPayload, "connected_with"));
      push(toStr(r.rawPayload, "caller_number"));
      push(toStr(r.rawPayload, "employee_number"));
      push(toStr(r.rawPayload, "additional_number"));
      push(toStr(r.rawPayload, "extension_number"));
      return out;
    };

    const withUniqueid = rows.filter((r) => !!getUniqueid(r.rawPayload));
    const withoutUniqueid = rows.filter((r) => !getUniqueid(r.rawPayload));

    let scanned = 0;
    let matched = 0;
    let merged = 0;
    let skipped = 0;

    const pickBestPartner = (cands: CallRow[]): CallRow | null => {
      if (cands.length === 0) return null;
      if (cands.length === 1) return cands[0];
      // Prefer a candidate that already has an activity (more connected).
      const withActivity = cands.filter((c) => !!c.activity);
      if (withActivity.length === 1) return withActivity[0];
      return null; // ambiguous
    };

    const isMissedLike = (status: string): boolean => status.toUpperCase().includes("MISS");
    const abs = (n: number) => (n < 0 ? -n : n);

    for (const row of withoutUniqueid) {
      // If the row already uses a stable Ringostat uniqueid as externalId, don't touch it.
      if (row.externalId && row.externalId.startsWith("ks1_")) continue;

      scanned += 1;
      const rowNums = extractDigitsSet(row);
      if (rowNums.size === 0) {
        skipped += 1;
        continue;
      }

      // Candidate pool: within ±10 minutes.
      const candidates = withUniqueid.filter(
        (c) => abs(c.startedAt.getTime() - row.startedAt.getTime()) <= 10 * 60_000,
      );
      if (candidates.length === 0) {
        skipped += 1;
        continue;
      }

      const scored = candidates
        .map((c) => {
          const cNums = extractDigitsSet(c);
          let overlap = 0;
          for (const n of rowNums) if (cNums.has(n)) overlap += 1;
          const dtMs = abs(c.startedAt.getTime() - row.startedAt.getTime());
          const dtScore = dtMs <= 60_000 ? 3 : dtMs <= 2 * 60_000 ? 2 : dtMs <= 5 * 60_000 ? 1 : 0;
          const statusBonus =
            row.status && row.status !== "UNKNOWN"
              ? c.status === row.status
                ? 2
                : isMissedLike(row.status) && isMissedLike(c.status)
                  ? 1
                  : 0
              : 0;
          const score = overlap * 10 + dtScore + statusBonus;
          return { c, overlap, score };
        })
        .filter((x) => x.overlap > 0)
        .sort((a, b) => b.score - a.score);

      if (scored.length === 0) {
        skipped += 1;
        continue;
      }

      const best = scored[0];
      const second = scored[1];
      if (second && second.score === best.score) {
        skipped += 1;
        continue;
      }

      const partner = pickBestPartner([best.c]);
      if (!partner) {
        skipped += 1;
        continue;
      }
      matched += 1;

      // Decide keeper: keep the row that has activity/outbound attempt/manual sessions, to preserve references.
      const score = (r: CallRow) =>
        (r.activity ? 100 : 0) + (r.outboundCallAttempt ? 50 : 0) + (r.manualCallSessions?.length ?? 0);
      const keeper = score(row) >= score(partner) ? row : partner;
      const other = keeper.id === row.id ? partner : row;
      const uniqueid = getUniqueid(partner.rawPayload) ?? getUniqueid(row.rawPayload);
      if (!uniqueid) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        merged += 1;
        continue;
      }

      await this.prisma.$transaction(async (tx) => {
        if (keeper.id === other.id) return;

        // If a row with externalId=uniqueid already exists (outside this pair), we must merge into it
        // instead of trying to update keeper.externalId (would violate @@unique(provider, externalId)).
        const existingKeyed = await tx.call.findUnique({
          where: { provider_externalId: { provider: RINGOSTAT_PROVIDER, externalId: uniqueid } },
          select: { id: true },
        });

        const targetId =
          existingKeyed && existingKeyed.id !== keeper.id && existingKeyed.id !== other.id
            ? existingKeyed.id
            : keeper.id;

        // Move unique relations first; Activity.callId and OutboundCallAttempt.callId are unique.
        // Only move if the target doesn't already have one.
        if (targetId !== keeper.id) {
          // We're merging into an existing keyed row: move keeper's relations too.
          await tx.activity.updateMany({
            where: { callId: keeper.id },
            data: { callId: targetId },
          });
          await tx.outboundCallAttempt.updateMany({
            where: { callId: keeper.id },
            data: { callId: targetId },
          });
          await tx.manualCallSession.updateMany({
            where: { callId: keeper.id },
            data: { callId: targetId },
          });
        }

        await tx.activity.updateMany({
          where: { callId: other.id },
          data: { callId: targetId },
        });
        await tx.outboundCallAttempt.updateMany({
          where: { callId: other.id },
          data: { callId: targetId },
        });
        await tx.manualCallSession.updateMany({
          where: { callId: other.id },
          data: { callId: targetId },
        });

        // Remove merged rows (idempotent).
        if (targetId !== keeper.id) {
          await tx.call.deleteMany({ where: { id: keeper.id } });
        }
        await tx.call.deleteMany({ where: { id: other.id } });

        // Update payload on target. Re-key externalId only when target is the keeper itself.
        await tx.call.updateMany({
          where: { id: targetId },
          data: {
            ...(targetId === keeper.id ? { externalId: uniqueid } : {}),
            rawPayload: (partner.rawPayload ?? keeper.rawPayload) as Prisma.InputJsonValue,
            recordingUrl: partner.recordingUrl ?? keeper.recordingUrl,
          } as Prisma.CallUpdateManyMutationInput,
        });
      });

      merged += 1;
    }

    const report: RingostatRekeyUniqueidReport = {
      dryRun,
      scanned,
      matched,
      merged,
      skipped,
      from: params.from,
      to: params.to,
      limit,
    };

    this.logger.log(
      `Ringostat rekey uniqueid ${dryRun ? "dry-run" : "apply"}: scanned=${scanned}, matched=${matched}, merged=${merged}, skipped=${skipped}, limit=${limit}`,
    );
    return report;
  }
}

