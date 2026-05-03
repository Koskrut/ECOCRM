import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsServiceModule } from "./settings-service.module";

@Module({
  imports: [SettingsServiceModule],
  controllers: [SettingsController],
  exports: [SettingsServiceModule],
})
export class SettingsModule {}
