import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RINGOSTAT_PROVIDER, RingostatIngestService } from "./ringostat-ingest.service";

export type RingostatReconcileParams = {
  from?: string;
  to?: string;
  dryRun?: boolean;
  limit?: number;
};

export type RingostatReconcileReport = {
  dryRun: boolean;
  scanned: number;
  fixable: number;
  updated: number;
  skipped: number;
  from?: string;
  to?: string;
  limit: number;
};

@Injectable()
export class RingostatReconcileService {
  private readonly logger = new Logger(RingostatReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: RingostatIngestService,
  ) {}

  async reconcile(params: RingostatReconcileParams): Promise<RingostatReconcileReport> {
    const dryRun = params.dryRun !== false;
    const limit = Math.max(1, Math.min(params.limit ?? 1000, 20_000));
    const fromDate = params.from ? new Date(params.from) : null;
    const toDate = params.to ? new Date(params.to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new BadRequestException("Invalid from date");
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new BadRequestException("Invalid to date");
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      throw new BadRequestException("from must be <= to");
    }

    const rows = await this.prisma.call.findMany({
      where: {
        provider: RINGOSTAT_PROVIDER,
        ...(fromDate || toDate
          ? {
              startedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        from: true,
        to: true,
        fromNormalized: true,
        toNormalized: true,
        managerUserId: true,
        rawPayload: true,
      },
      orderBy: { startedAt: "desc" },
      take: limit,
    });

    let scanned = 0;
    let fixable = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!this.isProblematic(row.fromNormalized, row.toNormalized, row.managerUserId)) {
        skipped += 1;
        continue;
      }
      scanned += 1;

      const recomputed = await this.ingest.recomputeLegsFromRaw(row.rawPayload);
      if (!recomputed) {
        skipped += 1;
        continue;
      }

      const improved =
        this.isBetterClientLeg(row.fromNormalized, recomputed.fromNormalized) ||
        this.isResolvedLegDuplication(
          row.fromNormalized,
          row.toNormalized,
          recomputed.fromNormalized,
          recomputed.toNormalized,
        ) ||
        this.isNewManagerLinked(row.managerUserId, recomputed.managerUserId);

      const changed =
        row.from !== recomputed.from ||
        row.to !== recomputed.to ||
        row.fromNormalized !== recomputed.fromNormalized ||
        row.toNormalized !== recomputed.toNormalized ||
        row.managerUserId !== recomputed.managerUserId;

      if (!improved || !changed) {
        skipped += 1;
        continue;
      }

      fixable += 1;
      if (!dryRun) {
        await this.prisma.call.update({
          where: { id: row.id },
          data: {
            from: recomputed.from,
            to: recomputed.to,
            fromNormalized: recomputed.fromNormalized,
            toNormalized: recomputed.toNormalized,
            managerUserId: recomputed.managerUserId,
          },
        });
        updated += 1;
      }
    }

    const report: RingostatReconcileReport = {
      dryRun,
      scanned,
      fixable,
      updated,
      skipped,
      from: params.from,
      to: params.to,
      limit,
    };

    this.logger.log(
      `Ringostat reconcile ${dryRun ? "dry-run" : "apply"}: scanned=${scanned}, fixable=${fixable}, updated=${updated}, skipped=${skipped}, limit=${limit}`,
    );
    return report;
  }

  /**
   * Decide if a row is worth re-evaluating.
   *
   * We include:
   * - missing client leg (fromNormalized null)
   * - duplicated legs (from == to)
   * - missing manager leg / mapping input (toNormalized null)
   * - missing manager link (managerUserId null)
   *
   * This lets reconcile start "doing work" right after backfill enriches rawPayload
   * with fields like employee_number/connected_with/caller_number, even if historical
   * rows previously had no manager leg at all.
   */
  private isProblematic(
    fromNormalized: string | null,
    toNormalized: string | null,
    managerUserId: string | null,
  ): boolean {
    if (!fromNormalized) return true;
    if (!toNormalized) return true;
    if (!managerUserId) return true;
    return fromNormalized.replace(/\D/g, "") === toNormalized.replace(/\D/g, "");
  }

  private isBetterClientLeg(currentFrom: string | null, nextFrom: string | null): boolean {
    return !currentFrom && !!nextFrom;
  }

  private isResolvedLegDuplication(
    currentFrom: string | null,
    currentTo: string | null,
    nextFrom: string | null,
    nextTo: string | null,
  ): boolean {
    const same = (a: string | null, b: string | null) =>
      !!a && !!b && a.replace(/\D/g, "") === b.replace(/\D/g, "");
    return same(currentFrom, currentTo) && !same(nextFrom, nextTo);
  }

  private isNewManagerLinked(currentManager: string | null, nextManager: string | null): boolean {
    return !currentManager && !!nextManager;
  }
}

