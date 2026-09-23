import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { TelegramModule } from "../integrations/telegram/telegram.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { ReceivablesController } from "./receivables.controller";
import { ReceivablesService } from "./receivables.service";

@Module({
  imports: [PrismaModule, SettingsModule, AnalyticsModule, TelegramModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
