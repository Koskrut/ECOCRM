import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withRetryOnConnectionClosed } from "../../prisma/db-retry";
import { PrismaService } from "../../prisma/prisma.service";
import { fetchRingostatCallsList } from "./ringostat-calls-list";
import { RINGOSTAT_PROVIDER, RingostatIngestService } from "./ringostat-ingest.service";

type RingostatPollingConfig = {
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  projectId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
};

@Injectable()
export class RingostatPollingService {
  private readonly logger = new Logger(RingostatPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: RingostatIngestService,
  ) {}

  /**
   * Default: every 5 minutes. Точные интервалы можно будет настроить через конфиг.
   */
  @Cron("*/5 * * * *")
  async run(): Promise<void> {
    if (process.env.CRON_ENABLED !== "true") return;
    try {
      await withRetryOnConnectionClosed(
        async () => {
        const setting = await this.prisma.integrationSetting.findFirst({
        where: { provider: RINGOSTAT_PROVIDER },
      });
      if (!setting?.isEnabled) return;

      const cfg = (setting.config ?? null) as RingostatPollingConfig | null;
      if (!cfg?.usePolling) return;

      const apiToken = setting.apiToken ?? process.env.RINGOSTAT_API_TOKEN ?? null;
      if (!apiToken) {
        this.logger.warn("Ringostat polling enabled but apiToken not configured");
        return;
      }

      const now = new Date();
      const lookbackMinutes = cfg.pollingLookbackMinutes ?? 10;

      const lastPollAt = setting.lastPollAt ?? new Date(now.getTime() - lookbackMinutes * 60_000);
      const from = new Date(lastPollAt.getTime() - lookbackMinutes * 60_000);
      const to = now;

      const listResult = await fetchRingostatCallsList(
        {
          apiToken,
          apiBaseUrl: cfg.apiBaseUrl,
          pollingEndpoint: cfg.pollingEndpoint,
          projectId: cfg.projectId,
        },
        from,
        to,
      );

      if (!listResult.ok) {
        this.logger.error(
          `Ringostat polling HTTP ${listResult.status}: ${listResult.bodySnippet}`,
        );
        return;
      }

      const events = listResult.events;
      this.logger.log(`Ringostat polling fields mode: ${listResult.fieldsMode}`);

      if (events.length > 0) {
        await this.ingest.ingestFromApi(events);
      }

      await this.prisma.integrationSetting.update({
        where: { id: setting.id },
        data: { lastPollAt: now },
      });

      this.logger.log(
        `Ringostat polling done: events=${events.length}, window=${from.toISOString()}..${to.toISOString()}`,
      );
        },
        {
          onBeforeRetry: async () => {
            await this.prisma.$disconnect();
            await this.prisma.$connect();
          },
        },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`Ringostat polling failed: ${msg}`);
    }
  }
}

