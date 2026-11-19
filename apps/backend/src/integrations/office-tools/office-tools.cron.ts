import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../../audit/audit-context";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsSyncService } from "./office-tools-sync.service";

@Injectable()
export class OfficeToolsCron {
  private readonly logger = new Logger(OfficeToolsCron.name);

  constructor(
    private readonly config: OfficeToolsConfigService,
    private readonly sync: OfficeToolsSyncService,
  ) {}

  /** Pull rem / comprec / PDZ every 15 minutes when enabled. */
  @Cron("*/15 * * * *")
  async run(): Promise<void> {
    if (process.env.OFFICE_TOOLS_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (!(await this.config.isActive())) return;

    return withAuditSource("cron", "cron:office-tools-sync", async () => {
      try {
        await this.sync.syncAll();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Office Tools cron failed: ${message}`);
      }
    });
  }
}
