import { Module } from "@nestjs/common";
import { RingostatModule } from "../integrations/ringostat/ringostat.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

@Module({
  imports: [PrismaModule, RingostatModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
