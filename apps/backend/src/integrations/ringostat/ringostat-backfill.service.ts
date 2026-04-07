import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { runRingostatBackfillChunks } from "./ringostat-backfill.chunks";
import { fetchRingostatCallsList, type RingostatCallsListConfig } from "./ringostat-calls-list";
import { RINGOSTAT_PROVIDER, RingostatIngestService } from "./ringostat-ingest.service";

type RingostatStoredConfig = {
  projectId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
};

@Injectable()
export class RingostatBackfillService {
  private readonly logger = new Logger(RingostatBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: RingostatIngestService,
  ) {}

  /**
   * Pull historical calls from Ringostat /calls/list in overlapping chunks and ingest (upsert).
   */
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
      where: { provider: RINGOSTAT_PROVIDER },
    });
    const apiToken = setting?.apiToken ?? process.env.RINGOSTAT_API_TOKEN ?? null;
    if (!apiToken) {
      throw new BadRequestException("Ringostat API token is not configured");
    }

    const cfg = (setting?.config ?? null) as RingostatStoredConfig | null;
    const listCfg: RingostatCallsListConfig = {
      apiToken,
      apiBaseUrl: cfg?.apiBaseUrl,
      pollingEndpoint: cfg?.pollingEndpoint,
      projectId: cfg?.projectId,
    };

    this.logger.log(
      `Ringostat backfill start: ${from.toISOString()} .. ${to.toISOString()} (UTC window)`,
    );

    let processed = 0;
    const { chunks, totalEvents } = await runRingostatBackfillChunks(from, to, {
      fetchChunk: async (chunkFrom, chunkTo) => {
        const res = await fetchRingostatCallsList(listCfg, chunkFrom, chunkTo);
        if (!res.ok) {
          this.logger.error(
            `Ringostat backfill chunk failed HTTP ${res.status}: ${res.bodySnippet}`,
          );
          throw new ServiceUnavailableException(
            `Ringostat API error ${res.status}: ${res.bodySnippet.slice(0, 200)}`,
          );
        }
        this.logger.log(`Ringostat backfill fields mode: ${res.fieldsMode}`);
        return res.events;
      },
      ingestEvents: async (events) => {
        const stats = await this.ingest.ingestFromApi(events);
        processed += stats.processed;
      },
    });

    this.logger.log(
      `Ringostat backfill done: chunks=${chunks}, events=${totalEvents}, processed=${processed}`,
    );

    return {
      chunks,
      totalEvents,
      processed,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}
