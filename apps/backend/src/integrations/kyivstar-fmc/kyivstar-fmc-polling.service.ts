import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ModuleIds } from "../../modules/module-ids";
import { ModuleStateService } from "../../modules/module-state.service";
import { PrismaService } from "../../prisma/prisma.service";
import { withRetryOnConnectionClosed } from "../../prisma/db-retry";
import { fetchKyivstarCallHistory, type KyivstarFmcApiConfig } from "./kyivstar-fmc-api";
import { KYIVSTAR_FMC_PROVIDER, KyivstarFmcIngestService } from "./kyivstar-fmc-ingest.service";

type KyivstarFmcPollingConfig = {
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  integratorId?: string;
  apiBaseUrl?: string;
};

@Injectable()
export class KyivstarFmcPollingService {
  private readonly logger = new Logger(KyivstarFmcPollingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: KyivstarFmcIngestService,
    private readonly modules: ModuleStateService,
  ) {}

  /** Kyivstar recommends import every 5 minutes. */
  @Cron("*/5 * * * *")
  async run(): Promise<void> {
    if (process.env.KYIVSTAR_FMC_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.KyivstarFmc);
      if (!ok) return;
    }

    try {
      await withRetryOnConnectionClosed(async () => {
        const setting = await this.prisma.integrationSetting.findFirst({
          where: { provider: KYIVSTAR_FMC_PROVIDER },
        });
        if (!setting?.isEnabled) return;

        const cfg = (setting.config ?? null) as KyivstarFmcPollingConfig | null;
        if (cfg?.usePolling === false) return;

        const fmcToken = setting.apiToken ?? process.env.KYIVSTAR_FMC_TOKEN ?? null;
        const integratorId =
          cfg?.integratorId?.trim() || process.env.KYIVSTAR_FMC_INTEGRATOR_ID?.trim() || null;
        if (!fmcToken || !integratorId) {
          this.logger.warn("Kyivstar FMC polling enabled but FMC token or integrator_id missing");
          return;
        }

        const now = new Date();
        const lookbackMinutes = cfg?.pollingLookbackMinutes ?? 15;
        const lastPollAt = setting.lastPollAt ?? new Date(now.getTime() - lookbackMinutes * 60_000);
        const from = new Date(lastPollAt.getTime() - lookbackMinutes * 60_000);
        const to = now;

        const apiCfg: KyivstarFmcApiConfig = {
          fmcToken,
          integratorId,
          apiBaseUrl: cfg?.apiBaseUrl,
        };

        const listResult = await fetchKyivstarCallHistory(apiCfg, from, to);
        if (!listResult.ok) {
          this.logger.error(
            `Kyivstar FMC polling HTTP ${listResult.status}: ${listResult.bodySnippet}`,
          );
          return;
        }

        const metrics = await this.ingest.ingestFromCallHistory({ Calls: listResult.calls });
        await this.prisma.integrationSetting.updateMany({
          where: { provider: KYIVSTAR_FMC_PROVIDER },
          data: { lastPollAt: now },
        });

        this.logger.log(
          `Kyivstar FMC polling done: window=${from.toISOString()}..${to.toISOString()}, fetched=${listResult.calls.length}, processed=${metrics.processed}`,
        );
      });
    } catch (e) {
      this.logger.error(
        "Kyivstar FMC polling failed",
        e instanceof Error ? e.stack : String(e),
      );
    }
  }
}
