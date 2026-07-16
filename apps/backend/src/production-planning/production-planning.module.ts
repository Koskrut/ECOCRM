import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SystemModule } from "../system/system.module";
import { BomImportService } from "./bom-import.service";
import { BomService } from "./bom.service";
import { DemandRulesService } from "./demand-rules.service";
import { FactoryOrderService } from "./factory-order.service";
import { ForecastService } from "./forecast.service";
import { InventorySnapshotService } from "./inventory-snapshot.service";
import { PackingListService } from "./packing-list.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { ProductionPlanningController } from "./production-planning.controller";
import { ProductionService } from "./production.service";
import { WeeklyPlanningJob } from "./weekly-planning.job";

@Module({
  imports: [PrismaModule, SystemModule],
  controllers: [ProductionPlanningController],
  providers: [
    DemandRulesService,
    PlanningSettingsService,
    BomImportService,
    BomService,
    InventorySnapshotService,
    ForecastService,
    PlanningCalculationService,
    PackingListService,
    FactoryOrderService,
    ProductionService,
    WeeklyPlanningJob,
  ],
})
export class ProductionPlanningModule {}
