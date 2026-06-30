import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { DailyAgendaModule } from "../daily-agenda/daily-agenda.module";
import { DayPlanModule } from "../day-plan/day-plan.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardV2Service } from "./dashboard-v2.service";

@Module({
  imports: [PrismaModule, SettingsModule, DayPlanModule, DailyAgendaModule, AnalyticsModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardV2Service],
})
export class DashboardModule {}
