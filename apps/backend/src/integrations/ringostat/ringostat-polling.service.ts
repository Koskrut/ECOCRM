import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../../audit/audit-context";
import { ModuleStateService } from "../../modules/module-state.service";
import { ModuleIds } from "../../modules/module-ids";
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
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  /**
   * Default: every 5 minutes. Точные интервалы можно будет настроить через конфиг.
   */
  @Cron("*/5 * * * *")
  async run(): Promise<void> {
    if (process.env.RINGOSTAT_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.Ringostat);
      if (!ok) return;
    }
    return withAuditSource("cron", "cron:ringostat-polling", async () => {
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
      // Keep polling logs lightweight, but include a quick hint if events are missing stable ids.
      const sample = events.slice(0, 50) as Array<Record<string, unknown>>;
      const uniqueidCount = sample.reduce(
        (acc, e) => (e && e.uniqueid != null && String(e.uniqueid).trim() !== "" ? acc + 1 : acc),
        0,
      );
      this.logger.log(
        `Ringostat polling fields mode: ${listResult.fieldsMode} (sample=${sample.length}, uniqueid=${uniqueidCount})`,
      );

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
    }, { job: "ringostat-polling" });
  }
}

