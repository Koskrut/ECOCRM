import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsService } from "./settings.service";

/**
 * Settings persistence only (no HTTP controllers). Imported by {@link SettingsModule}
 * and by workers that need {@link SettingsService} without pulling full settings routes.
 */
@Module({
  imports: [PrismaModule],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsServiceModule {}
