import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { ContactsModule } from "../contacts/contacts.module";
import { DailyAgendaModule } from "../daily-agenda/daily-agenda.module";
import { DayPlanModule } from "../day-plan/day-plan.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { EmployeeDailyActivityService } from "./employee-daily-activity.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardV2Service } from "./dashboard-v2.service";
import { ManagerDashboardService } from "./manager-dashboard.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    DayPlanModule,
    DailyAgendaModule,
    AnalyticsModule,
    ContactsModule,
  ],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardV2Service,
    ManagerDashboardService,
    EmployeeDailyActivityService,
  ],
})
export class DashboardModule {}
