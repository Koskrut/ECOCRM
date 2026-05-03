import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withRetryOnConnectionClosed } from "../prisma/db-retry";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { OutboundQueueService } from "./outbound-queue.service";
import { OutboundCallLinkReconcileService } from "./outbound-call-link-reconcile.service";

@Injectable()
export class OutboundOrchestratorCron {
  private readonly logger = new Logger(OutboundOrchestratorCron.name);

  constructor(
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
    @Inject(OutboundQueueService) private readonly queue: OutboundQueueService,
    @Inject(OutboundCallLinkReconcileService)
    private readonly callLinkReconcile: OutboundCallLinkReconcileService,
  ) {}

  /** Promote queue + dial attempts. */
  @Cron("*/2 * * * *")
  async run(): Promise<void> {
    if (process.env.OUTBOUND_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.VoiceOutbound);
      if (!ok) return;
    }
    try {
      await withRetryOnConnectionClosed(async () => {
        const promoted = await this.queue.promotePendingToQueued(80);
        const dialed = await this.queue.processQueuedDialAttempts(15);
        if (promoted > 0 || dialed > 0) {
          this.logger.log(`Outbound cron: promoted=${promoted}, dialed=${dialed}`);
        }
      });
    } catch (e) {
      this.logger.error(`Outbound cron failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Safe-mode delayed Call linking (no ambiguity, no overwrite). */
  @Cron("*/5 * * * *")
  async reconcileOutboundCallLinks(): Promise<void> {
    if (process.env.OUTBOUND_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.VoiceOutbound);
      if (!ok) return;
    }
    try {
      await withRetryOnConnectionClosed(async () => {
        const linked = await this.callLinkReconcile.reconcileUnlinkedAttempts();
        if (linked > 0) {
          this.logger.log(`Outbound cron: call-link reconcile linked=${linked}`);
        }
      });
    } catch (e) {
      this.logger.error(
        `Outbound call-link reconcile failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
