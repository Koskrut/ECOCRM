import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { BomImportService } from "./bom-import.service";
import { BomService } from "./bom.service";
import { DemandRulesService } from "./demand-rules.service";
import { InventorySnapshotService } from "./inventory-snapshot.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { ProductionPlanningController } from "./production-planning.controller";
import { ProductionService } from "./production.service";
import { WeeklyPlanningJob } from "./weekly-planning.job";

@Module({
  imports: [PrismaModule],
  controllers: [ProductionPlanningController],
  providers: [
    DemandRulesService,
    BomImportService,
    BomService,
    InventorySnapshotService,
    PlanningCalculationService,
    ProductionService,
    WeeklyPlanningJob,
  ],
})
export class ProductionPlanningModule {}

