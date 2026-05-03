import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PlanningItemType, ProductionStageCode } from "@prisma/client";
import { ModuleStateService } from "../modules/module-state.service";
import { ModuleIds } from "../modules/module-ids";
import { PrismaService } from "../prisma/prisma.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { ProductionService } from "./production.service";

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
    private readonly prisma: PrismaService,
    private readonly production: ProductionService,
    private readonly calculations: PlanningCalculationService,
    @Inject(ModuleStateService) private readonly modules: ModuleStateService,
  ) {}

  @Cron("0 6 * * 1")
  async generateWeeklyItems() {
    await this.runNow();
  }

  async runNow() {
    if (process.env.PLANNING_CRON_DISABLED === "true") return;
    if (process.env.MODULE_GATING_ENABLED === "true") {
      const ok = await this.modules.isEffective(ModuleIds.ProductionPlanning);
      if (!ok) return;
    }
    const weekStart = getWeekStart();
    await this.production.ensureDefaultStages();
    const [qcQueue, packQueue, launch] = await Promise.all([
      this.production.getQcQueue(),
      this.production.getPackingQueue(),
      this.calculations.getLaunchRecommendations(1),
    ]);

    await this.prisma.$transaction(async (tx) => {
      await tx.weeklyPlanItem.deleteMany({ where: { weekStart } });

      for (const row of qcQueue) {
        await tx.weeklyPlanItem.create({
          data: {
            weekStart,
            type: PlanningItemType.QC_QUEUE,
            batchId: row.id,
            productId: row.productId,
            qty: row.qtyPlanned,
            title: `QC: ${row.code}`,
            details: { stage: ProductionStageCode.QC, dueAt: row.dueAt?.toISOString() ?? null },
          },
        });
      }
      for (const row of packQueue) {
        await tx.weeklyPlanItem.create({
          data: {
            weekStart,
            type: PlanningItemType.PACK_QUEUE,
            batchId: row.id,
            productId: row.productId,
            qty: row.qtyPlanned,
            title: `Pack: ${row.code}`,
            details: { stage: ProductionStageCode.PACK, dueAt: row.dueAt?.toISOString() ?? null },
          },
        });
      }
      for (const row of launch.recommendations) {
        await tx.weeklyPlanItem.create({
          data: {
            weekStart,
            type: PlanningItemType.LAUNCH_LIST,
            productId: row.productId,
            qty: row.suggestedLaunchQty,
            title: "Launch recommendation",
            details: row,
          },
        });
      }
    });

    this.logger.log(
      `Weekly planning generated for ${weekStart.toISOString().slice(0, 10)}; qc=${qcQueue.length}, pack=${packQueue.length}, launch=${launch.recommendations.length}`,
    );
    return { weekStart, qcQueue: qcQueue.length, packQueue: packQueue.length, launch: launch.recommendations.length };
  }
}

