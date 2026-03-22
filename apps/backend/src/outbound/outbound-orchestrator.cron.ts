import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withRetryOnConnectionClosed } from "../prisma/db-retry";
import { OutboundQueueService } from "./outbound-queue.service";
import { OutboundCallLinkReconcileService } from "./outbound-call-link-reconcile.service";

@Injectable()
export class OutboundOrchestratorCron {
  private readonly logger = new Logger(OutboundOrchestratorCron.name);

  constructor(
    private readonly queue: OutboundQueueService,
    private readonly callLinkReconcile: OutboundCallLinkReconcileService,
  ) {}

  /** Promote queue + dial attempts. */
  @Cron("*/2 * * * *")
  async run(): Promise<void> {
    if (process.env.CRON_ENABLED !== "true") return;
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
    if (process.env.CRON_ENABLED !== "true") return;
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
