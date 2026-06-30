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

