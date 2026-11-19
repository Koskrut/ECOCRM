import { forwardRef, Module } from "@nestjs/common";
import { AnalyticsModule } from "../analytics/analytics.module";
import { TelegramModule } from "../integrations/telegram/telegram.module";
import { PaymentRequestsModule } from "../payment-requests/payment-requests.module";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsModule } from "../settings/settings.module";
import { ReceivablesController } from "./receivables.controller";
import { ReceivablesService } from "./receivables.service";

@Module({
  imports: [
    PrismaModule,
    SettingsModule,
    AnalyticsModule,
    PaymentRequestsModule,
    forwardRef(() => TelegramModule),
    forwardRef(() => require("../integrations/office-tools/office-tools.module").OfficeToolsModule),
  ],
  controllers: [ReceivablesController],
  providers: [ReceivablesService],
  exports: [ReceivablesService],
})
export class ReceivablesModule {}
