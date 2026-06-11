import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { fetchKyivstarCallHistory, type KyivstarFmcApiConfig } from "./kyivstar-fmc-api";
import { KYIVSTAR_FMC_PROVIDER, KyivstarFmcIngestService } from "./kyivstar-fmc-ingest.service";

type KyivstarFmcStoredConfig = {
  integratorId?: string;
  apiBaseUrl?: string;
};

const MAX_CHUNK_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class KyivstarFmcBackfillService {
  private readonly logger = new Logger(KyivstarFmcBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: KyivstarFmcIngestService,
  ) {}

  async backfill(fromIso: string, toIso: string): Promise<{
    chunks: number;
    totalEvents: number;
    processed: number;
    from: string;
    to: string;
  }> {
    const from = new Date(fromIso);
    const to = new Date(toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("Invalid from/to date");
    }
    if (from.getTime() >= to.getTime()) {
      throw new BadRequestException("from must be before to");
    }

    const setting = await this.prisma.integrationSetting.findFirst({
      where: { provider: KYIVSTAR_FMC_PROVIDER },
    });
    const fmcToken = setting?.apiToken ?? process.env.KYIVSTAR_FMC_TOKEN ?? null;
    const cfg = (setting?.config ?? null) as KyivstarFmcStoredConfig | null;
    const integratorId =
      cfg?.integratorId?.trim() || process.env.KYIVSTAR_FMC_INTEGRATOR_ID?.trim() || null;
    if (!fmcToken || !integratorId) {
      throw new BadRequestException("Kyivstar FMC token or integrator_id is not configured");
    }

    const apiCfg: KyivstarFmcApiConfig = {
      fmcToken,
      integratorId,
      apiBaseUrl: cfg?.apiBaseUrl,
    };

    let chunks = 0;
    let totalEvents = 0;
    let processed = 0;
    let cur = from;

    this.logger.log(`Kyivstar FMC backfill start: ${from.toISOString()} .. ${to.toISOString()}`);

    while (cur.getTime() < to.getTime()) {
      const chunkEnd = new Date(Math.min(cur.getTime() + MAX_CHUNK_MS, to.getTime()));
      const listResult = await fetchKyivstarCallHistory(apiCfg, cur, chunkEnd);
      if (!listResult.ok) {
        throw new ServiceUnavailableException(
          `Kyivstar FMC API error ${listResult.status}: ${listResult.bodySnippet.slice(0, 200)}`,
        );
      }

      chunks += 1;
      totalEvents += listResult.calls.length;
      const metrics = await this.ingest.ingestFromCallHistory({ Calls: listResult.calls });
      processed += metrics.processed;

      cur = chunkEnd;
    }

    this.logger.log(
      `Kyivstar FMC backfill done: chunks=${chunks}, totalEvents=${totalEvents}, processed=${processed}`,
    );

    return {
      chunks,
      totalEvents,
      processed,
      from: fromIso,
      to: toIso,
    };
  }
}
