import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsServiceModule } from "../settings/settings-service.module";
import { SystemModule } from "../system/system.module";
import { BomImportService } from "./bom-import.service";
import { BomService } from "./bom.service";
import { DemandForecastService } from "./demand-forecast.service";
import { DemandRulesService } from "./demand-rules.service";
import { FactoryOrderService } from "./factory-order.service";
import { ForecastService } from "./forecast.service";
import { InventorySnapshotService } from "./inventory-snapshot.service";
import { MrpCalculationService } from "./mrp-calculation.service";
import { MrpConfigService } from "./mrp-config.service";
import { PackingListService } from "./packing-list.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRunService } from "./planning-run.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { ProductionPlanningController } from "./production-planning.controller";
import { ProductionService } from "./production.service";
import { SalesHistoryService } from "./sales-history.service";
import { MrpActionListService } from "./mrp-action-list.service";
import { PlanningTodayService } from "./planning-today.service";
import { PlanningRemindersService } from "./planning-reminders.service";
import { PlanningRemindersCron } from "./planning-reminders.cron";
import { WeeklyPlanningJob } from "./weekly-planning.job";
import { KitPortfolioService } from "./kit-portfolio.service";

@Module({
  imports: [PrismaModule, SystemModule, NotificationsModule, SettingsServiceModule],
  controllers: [ProductionPlanningController],
  providers: [
    DemandRulesService,
    PlanningSettingsService,
    MrpConfigService,
    BomImportService,
    BomService,
    InventorySnapshotService,
    ForecastService,
    PlanningCalculationService,
    DemandForecastService,
    MrpCalculationService,
    PlanningRunService,
    SalesHistoryService,
    MrpActionListService,
    PackingListService,
    FactoryOrderService,
    ProductionService,
    PlanningTodayService,
    PlanningRemindersService,
    PlanningRemindersCron,
    WeeklyPlanningJob,
    KitPortfolioService,
  ],
})
export class ProductionPlanningModule {}
