import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SystemUpdateService } from "./system-update.service";

const DEFAULT_CRON = "*/15 * * * *";

@Injectable()
export class SystemAutoUpdateCron {
  private readonly logger = new Logger(SystemAutoUpdateCron.name);
  private running = false;

  constructor(@Inject(SystemUpdateService) private readonly updates: SystemUpdateService) {}

  @Cron(process.env.AUTO_UPDATE_CRON ?? DEFAULT_CRON)
  async run(): Promise<void> {
    if (process.env.AUTO_UPDATE_ENABLED !== "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (this.running) return;

    this.running = true;
    try {
      const job = await this.updates.tryAutoApply();
      if (job) {
        this.logger.log(`Auto-update started: ${job.fromVersion ?? "?"} → ${job.toVersion ?? "?"}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`Auto-update check failed: ${msg}`);
    } finally {
      this.running = false;
    }
  }
}
