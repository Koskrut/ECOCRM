import { Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { ReceivablesController } from "./receivables.controller";
import { ReceivablesService } from "./receivables.service";

@Module({
  imports: [PrismaModule, SettingsModule, AnalyticsModule],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
