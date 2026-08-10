import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../audit/audit-context";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { PlanningRemindersService } from "./planning-reminders.service";

@Injectable()
export class PlanningRemindersCron {
  private readonly logger = new Logger(PlanningRemindersCron.name);

  constructor(
    @Inject(PlanningRemindersService) private readonly reminders: PlanningRemindersService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  /** Remind warehouse/planning roles about factory orders and packing lists due today. */
  @Cron("0 8 * * *", { timeZone: "Europe/Kyiv" })
  async sendDueRemindersAtEightAm() {
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.PLANNING_CRON_DISABLED === "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) return;
    }
    return withAuditSource(
      "cron",
      "cron:planning-due-reminders",
      async () => {
        try {
          const r = await this.reminders.sendDueReminders();
          if (r.notified > 0) {
            this.logger.log(
              `Planning due reminders: ${r.notified} sent (skipped ${r.skipped} entities already notified)`,
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to send planning due reminders: ${msg}`);
        }
      },
      { job: "planning-due-reminders" },
    );
  }
}
