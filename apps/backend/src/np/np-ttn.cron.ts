import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../audit/audit-context";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { withRetryOnConnectionClosed } from "../prisma/db-retry";
import { PrismaService } from "../prisma/prisma.service";
import { NpTtnService } from "./np-ttn.service";

@Injectable()
export class NpTtnCron {
  private readonly logger = new Logger(NpTtnCron.name);

  constructor(
    @Inject(NpTtnService) private readonly ttn: NpTtnService,
    private readonly prisma: PrismaService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  @Cron("*/5 * * * *")
  async syncActiveTtns() {
    if (process.env.NP_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.NovaPoshta);
      if (!ok) return;
    }
    return withAuditSource("cron", "cron:np-ttn-sync", async () => {
    try {
      const res = await withRetryOnConnectionClosed(() => this.ttn.syncActiveTtns({ limit: 100 }), {
        onBeforeRetry: async () => {
          await this.prisma.$disconnect();
          await this.prisma.$connect();
        },
      });
      this.logger.log(
        `NP TTN sync done: checked=${res.checked}, updatedOrders=${res.updatedOrders}, skipped=${res.skipped}`,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`NP TTN sync failed: ${msg}`);
    }
    }, { job: "np-ttn-sync" });
  }
}
