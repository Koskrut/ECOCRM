import { Module } from "@nestjs/common";
import { DayPlanModule } from "../day-plan/day-plan.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [PrismaModule, SettingsModule, DayPlanModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
