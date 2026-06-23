import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DayPlanSettingsController } from "./day-plan-settings.controller";
import { DayPlanController } from "./day-plan.controller";
import { DayPlanSettingsService } from "./day-plan.settings.service";
import { DayPlanService } from "./day-plan.service";

@Module({
  imports: [PrismaModule],
  controllers: [DayPlanController, DayPlanSettingsController],
  providers: [DayPlanService, DayPlanSettingsService],
  exports: [DayPlanService, DayPlanSettingsService],
})
export class DayPlanModule {}
