import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { withAuditSource } from "../audit/audit-context";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { FieldShiftsService } from "./field-shifts.service";

@Injectable()
export class FieldShiftsCron {
  private readonly logger = new Logger(FieldShiftsCron.name);

  constructor(
    @Inject(FieldShiftsService) private readonly shifts: FieldShiftsService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  /** Remind field reps to close a still-open shift at 20:00 Kyiv. */
  @Cron("0 20 * * *", { timeZone: "Europe/Kyiv" })
  async remindCloseShiftAtEightPm() {
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.Visits);
      if (!ok) return;
    }
    return withAuditSource(
      "cron",
      "cron:field-shifts-close-reminder",
      async () => {
        try {
          const r = await this.shifts.remindOpenShiftsToClose();
          if (r.notified > 0) {
            this.logger.log(
              `Shift close reminders sent: ${r.notified} (skipped ${r.skipped} already sent)`,
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to send shift close reminders: ${msg}`);
        }
      },
      { job: "field-shifts-close-reminder" },
    );
  }

  /** Notify owners when GPS on an active shift has been stale >10 min. */
  @Cron("*/5 * * * *", { timeZone: "Europe/Kyiv" })
  async notifyStaleGpsEveryFiveMinutes() {
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.Visits);
      if (!ok) return;
    }
    return withAuditSource(
      "cron",
      "cron:field-gps-stale",
      async () => {
        try {
          const r = await this.shifts.notifyStaleGpsShifts();
          if (r.notified > 0) {
            this.logger.log(
              `GPS stale push sent: ${r.notified} (skipped ${r.skipped})`,
            );
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to send GPS stale notifications: ${msg}`);
        }
      },
      { job: "field-gps-stale" },
    );
  }

  /** Close stale field shifts once a day (Kyiv calendar). */
  @Cron("5 0 * * *", { timeZone: "Europe/Kyiv" })
  async closeStaleNightly() {
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.Visits);
      if (!ok) return;
    }
    return withAuditSource(
      "cron",
      "cron:field-shifts-close-stale",
      async () => {
        try {
          const r = await this.shifts.closeStaleActiveShifts();
          if (r.closed > 0) {
            this.logger.log(`Closed stale shifts: ${r.closed}`);
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`Failed to close stale shifts: ${msg}`);
        }
      },
      { job: "field-shifts-close-stale" },
    );
  }
}

