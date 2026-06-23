import { Module } from "@nestjs/common";
import { DayPlanModule } from "../day-plan/day-plan.module";
import { SettingsController } from "./settings.controller";
import { SettingsServiceModule } from "./settings-service.module";

@Module({
  imports: [SettingsServiceModule, DayPlanModule],
  controllers: [SettingsController],
  exports: [SettingsServiceModule],
})
export class SettingsModule {}
