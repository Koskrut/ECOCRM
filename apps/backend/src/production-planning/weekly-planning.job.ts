import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PlanningRunMode } from "@prisma/client";
import { withAuditSource } from "../audit/audit-context";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRunService } from "./planning-run.service";
import { ProductionService } from "./production.service";
import { PackingListService } from "./packing-list.service";

function getWeekStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

@Injectable()
export class WeeklyPlanningJob {
  private readonly logger = new Logger(WeeklyPlanningJob.name);

  constructor(
    private readonly production: ProductionService,
    private readonly calculations: PlanningCalculationService,
    private readonly planningRuns: PlanningRunService,
    private readonly packingLists: PackingListService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  /** Weekly full MRP + legacy WIP plan items — Mondays 06:00 */
  @Cron("0 6 * * 1")
  async generateWeeklyItems() {
    if (process.env.PLANNING_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) return;
    }
    await this.runNow();
  }

  /** Friday packing request (~2000 kits) — 06:00 */
  @Cron("0 6 * * 5")
  async proposeFridayPacking() {
    if (process.env.PLANNING_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) return;
    }
    return withAuditSource("cron", "cron:friday-packing", async () => {
      try {
        const result = await this.packingLists.proposeForCurrentCycle(false);
        this.logger.log(
          result.skipped
            ? `Friday packing skipped (${result.reason}) list=${result.list.id}`
            : `Friday packing draft ${result.list.id}; used=${result.list.capacityUsed}/${result.list.capacityLimit}`,
        );
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Friday packing propose skipped: ${message}`);
        return { skipped: true as const, reason: "error", message };
      }
    }, { job: "friday-packing" });
  }

  /** Daily critical-only MRP — every day 06:30 */
  @Cron("30 6 * * *")
  async generateDailyCritical() {
    if (process.env.PLANNING_CRON_DISABLED === "true") return;
    if (process.env.CRON_ENABLED !== "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) return;
    }
    return withAuditSource("cron", "cron:daily-mrp-critical", async () => {
      const run = await this.planningRuns.runAndPersist(PlanningRunMode.CRITICAL);
      this.logger.log(
        `Daily critical MRP run ${run.id}; critical=${run.summary?.criticalCount ?? 0}, semi=${run.summary?.semiCount ?? 0}`,
      );
      return { runId: run.id, summary: run.summary };
    }, { job: "daily-mrp-critical" });
  }

  async runNow() {
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) throw new BadRequestException("Production planning module is not effective");
    }
    return withAuditSource("cron", "cron:weekly-planning", async () => {
      const weekStart = getWeekStart();
      await this.production.ensureDefaultStages();
      const [qcQueue, packQueue, launch, mrpRun] = await Promise.all([
        this.production.getQcQueue(),
        this.production.getPackingQueue(),
        this.calculations.getLaunchRecommendations(1),
        this.planningRuns.runAndPersist(PlanningRunMode.FULL),
      ]);

      this.logger.log(
        `Weekly planning refreshed for ${weekStart.toISOString().slice(0, 10)}; qc=${qcQueue.length}, pack=${packQueue.length}, launch=${launch.recommendations.length}, mrpRun=${mrpRun.id}`,
      );
      return {
        weekStart,
        qcQueue: qcQueue.length,
        packQueue: packQueue.length,
        launch: launch.recommendations.length,
        mrpRunId: mrpRun.id,
        mrpSummary: mrpRun.summary,
      };
    }, { job: "weekly-planning" });
  }
}
