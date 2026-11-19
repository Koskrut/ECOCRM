import { Module, forwardRef } from "@nestjs/common";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { PaymentsModule } from "../../payments/payments.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SystemModule } from "../../system/system.module";
import { OfficeToolsConfigService } from "./office-tools-config.service";
import { OfficeToolsContactService } from "./office-tools-contact.service";
import { OfficeToolsIntegrationAdapter } from "./office-tools-integration.adapter";
import { OfficeToolsOrderService } from "./office-tools-order.service";
import { OfficeToolsPaymentsService } from "./office-tools-payments.service";
import { OfficeToolsReceivablesService } from "./office-tools-receivables.service";
import { OfficeToolsSettingsController } from "./office-tools-settings.controller";
import { OfficeToolsStockService } from "./office-tools-stock.service";
import { OfficeToolsSyncService } from "./office-tools-sync.service";
import { OfficeToolsCron } from "./office-tools.cron";

@Module({
  imports: [
    PrismaModule,
    SystemModule,
    IntegrationPortsModule,
    PaymentsModule,
    // Lazy require avoids CJS cycle: Contacts → OfficeTools → Receivables → Telegram → Contacts.
    forwardRef(() => require("../../receivables/receivables.module").ReceivablesModule),
  ],
  controllers: [OfficeToolsSettingsController],
  providers: [
    OfficeToolsConfigService,
    OfficeToolsContactService,
    OfficeToolsOrderService,
    OfficeToolsStockService,
    OfficeToolsPaymentsService,
    OfficeToolsReceivablesService,
    OfficeToolsSyncService,
    OfficeToolsCron,
    OfficeToolsIntegrationAdapter,
  ],
  exports: [OfficeToolsConfigService, OfficeToolsContactService, OfficeToolsOrderService],
})
export class OfficeToolsModule {}
