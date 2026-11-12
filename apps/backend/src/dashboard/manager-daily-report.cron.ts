import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DateTime } from "luxon";
import { withAuditSource } from "../audit/audit-context";
import { CRM_TIME_ZONE } from "../crm-timezone";
import { SettingsService } from "../settings/settings.service";
import { ManagerDailyReportService } from "./manager-daily-report.service";

@Injectable()
export class ManagerDailyReportCron {
  private readonly logger = new Logger(ManagerDailyReportCron.name);

  constructor(
    private readonly reports: ManagerDailyReportService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Poll every minute; fire when Kyiv wall-clock matches Telegram daily-report settings.
   * Idempotency in the service prevents duplicate DMs for the same calendar day.
   */
  @Cron("* * * * *", { timeZone: "Europe/Kyiv" })
  async tickDailyWorkReport() {
    if (process.env.CRON_ENABLED !== "true") return;
    return withAuditSource(
      "cron",
      "cron:manager-daily-work-report",
      async () => {
        try {
          const cfg = await this.settings.getTelegramDailyWorkReportConfig();
          if (!cfg.enabled) return;

          const now = DateTime.now().setZone(CRM_TIME_ZONE);
          const hhmm = now.toFormat("HH:mm");
          if (hhmm !== cfg.time) return;
          if (cfg.weekdaysOnly && now.weekday > 5) return;

          const r = await this.reports.sendDailyReports();
          if (r.sent > 0 || r.skipped > 0) {
            this.logger.log(
              `Manager daily work reports: sent=${r.sent} skipped=${r.skipped}`,
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to send manager daily work reports: ${msg}`);
        }
      },
      { job: "manager-daily-work-report" },
    );
  }
}
