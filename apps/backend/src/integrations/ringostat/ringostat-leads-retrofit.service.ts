import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { RINGOSTAT_PROVIDER } from "./ringostat-ingest.service";

export type RingostatLeadsRetrofitParams = {
  from?: string;
  to?: string;
  dryRun?: boolean;
};

export type RingostatLeadsRetrofitReport = {
  dryRun: boolean;
  from?: string;
  to?: string;
  markedRingostat: number;
  ownerFilled: number;
};

@Injectable()
export class RingostatLeadsRetrofitService {
  private readonly logger = new Logger(RingostatLeadsRetrofitService.name);

  constructor(private readonly prisma: PrismaService) {}

  async retrofit(params: RingostatLeadsRetrofitParams): Promise<RingostatLeadsRetrofitReport> {
    const dryRun = params.dryRun !== false;
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

    const dateWhere =
      fromDate || toDate
        ? Prisma.sql` AND l."createdAt" >= ${fromDate ?? new Date(0)} AND l."createdAt" <= ${toDate ?? new Date()} `
        : Prisma.empty;

    if (dryRun) {
      const markedRingostat = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint as cnt
          FROM "Lead" l
          WHERE l."source" <> 'RINGOSTAT'
            ${dateWhere}
            AND EXISTS (
              SELECT 1
              FROM "Call" c
              WHERE c."provider" = ${RINGOSTAT_PROVIDER}
                AND c."leadId" = l."id"
            )
        `,
      );
      const ownerFilled = await this.prisma.$queryRaw<Array<{ cnt: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint as cnt
          FROM "Lead" l
          WHERE l."ownerId" IS NULL
            ${dateWhere}
            AND EXISTS (
              SELECT 1
              FROM "Call" c
              WHERE c."provider" = ${RINGOSTAT_PROVIDER}
                AND c."leadId" = l."id"
                AND c."managerUserId" IS NOT NULL
            )
        `,
      );
      return {
        dryRun,
        from: params.from,
        to: params.to,
        markedRingostat: Number(markedRingostat[0]?.cnt ?? 0n),
        ownerFilled: Number(ownerFilled[0]?.cnt ?? 0n),
      };
    }

    const markedRingostat = await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Lead" l
        SET "source" = 'RINGOSTAT'
        WHERE l."source" <> 'RINGOSTAT'
          ${dateWhere}
          AND EXISTS (
            SELECT 1
            FROM "Call" c
            WHERE c."provider" = ${RINGOSTAT_PROVIDER}
              AND c."leadId" = l."id"
          )
      `,
    );

    // Fill ownerId from the latest Ringostat call with managerUserId (best-effort).
    const ownerFilled = await this.prisma.$executeRaw(
      Prisma.sql`
        WITH latest_mgr AS (
          SELECT DISTINCT ON (c."leadId")
            c."leadId" as lead_id,
            c."managerUserId" as owner_id
          FROM "Call" c
          WHERE c."provider" = ${RINGOSTAT_PROVIDER}
            AND c."leadId" IS NOT NULL
            AND c."managerUserId" IS NOT NULL
          ORDER BY c."leadId", c."startedAt" DESC
        )
        UPDATE "Lead" l
        SET "ownerId" = latest_mgr.owner_id
        FROM latest_mgr
        WHERE l."id" = latest_mgr.lead_id
          AND l."ownerId" IS NULL
          ${dateWhere}
      `,
    );

    const report: RingostatLeadsRetrofitReport = {
      dryRun,
      from: params.from,
      to: params.to,
      markedRingostat: Number(markedRingostat ?? 0),
      ownerFilled: Number(ownerFilled ?? 0),
    };

    this.logger.log(
      `Ringostat leads retrofit: markedRingostat=${report.markedRingostat}, ownerFilled=${report.ownerFilled}`,
    );
    return report;
  }
}

