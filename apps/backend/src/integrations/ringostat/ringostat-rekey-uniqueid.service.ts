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
  rawPayload: Prisma.JsonValue;
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
        rawPayload: true,
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
      if (typeof v !== "string") return null;
      const s = v.trim();
      return s.length > 0 ? s : null;
    };

    const getStr = (raw: Prisma.JsonValue, key: string): string => {
      if (!raw || typeof raw !== "object") return "";
      const v = (raw as Record<string, unknown>)[key];
      return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    };

    // Build an index from "signature" -> call with uniqueid.
    // We intentionally use stable primitives that exist both in old synthetic rows and in calls/list rows.
    const signature = (raw: Prisma.JsonValue, startedAt: Date, direction: string, status: string, durationSec: number | null): string => {
      const caller = getStr(raw, "caller") || getStr(raw, "src") || getStr(raw, "E164") || getStr(raw, "connected_with");
      const dst = getStr(raw, "dst") || getStr(raw, "callee");
      const billsec = getStr(raw, "billsec");
      const disposition = getStr(raw, "disposition");
      return [
        startedAt.toISOString(),
        direction,
        status,
        String(durationSec ?? ""),
        caller.replace(/\D/g, ""),
        dst.replace(/\D/g, ""),
        billsec.replace(/\D/g, ""),
        disposition,
      ].join("|");
    };

    const withId = rows.filter((r) => !!getUniqueid(r.rawPayload));
    const bySig = new Map<string, CallRow>();
    for (const r of withId) {
      const sig = signature(r.rawPayload, r.startedAt, r.direction, r.status, r.durationSec);
      // Prefer a row that already has an activity (more "connected").
      const existing = bySig.get(sig);
      if (!existing || (!!r.activity && !existing.activity)) bySig.set(sig, r);
    }

    const isSynthetic = (externalId: string): boolean => externalId.startsWith("syn|");

    let scanned = 0;
    let matched = 0;
    let merged = 0;
    let skipped = 0;

    for (const row of rows) {
      const uid = getUniqueid(row.rawPayload);
      if (uid) continue; // already keyed
      if (!isSynthetic(row.externalId)) continue; // not a synthetic legacy row

      scanned += 1;
      const sig = signature(row.rawPayload, row.startedAt, row.direction, row.status, row.durationSec);
      const partner = bySig.get(sig);
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
        // Move relations to keeper (only if keeper doesn't already have them).
        if (!keeper.activity && other.activity) {
          await tx.activity.update({ where: { id: other.activity.id }, data: { callId: keeper.id } });
        }
        if (!keeper.outboundCallAttempt && other.outboundCallAttempt) {
          await tx.outboundCallAttempt.update({
            where: { id: other.outboundCallAttempt.id },
            data: { callId: keeper.id },
          });
        }
        if ((other.manualCallSessions?.length ?? 0) > 0) {
          await tx.manualCallSession.updateMany({
            where: { callId: other.id },
            data: { callId: keeper.id },
          });
        }

        // Delete the "other" row first, freeing the unique constraint on (provider, externalId=uniqueid) if needed.
        await tx.call.delete({ where: { id: other.id } });

        // Re-key keeper to stable uniqueid and copy enriched rawPayload (prefer partner's payload).
        await tx.call.update({
          where: { id: keeper.id },
          data: {
            externalId: uniqueid,
            rawPayload: (partner.rawPayload ?? keeper.rawPayload) as Prisma.InputJsonValue,
            // Also copy key computed fields if partner has them (safe overwrite toward enrichment).
            recordingUrl: (partner as any).recordingUrl ?? undefined,
          } as Prisma.CallUpdateInput,
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

