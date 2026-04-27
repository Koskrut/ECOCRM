import { Module } from "@nestjs/common";
import { IntegrationPortsModule } from "../../integration-ports/integration-ports.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { GoogleSheetIntegrationAdapter } from "./google-sheet-integration.adapter";
import { GoogleSheetController } from "./google-sheet.controller";
import { GoogleSheetOrderDocumentsService } from "./google-sheet-order-documents.service";
import { GoogleSheetSendOrderService } from "./google-sheet-send-order.service";

@Module({
  imports: [PrismaModule, SettingsModule, IntegrationPortsModule],
  controllers: [GoogleSheetController],
  providers: [GoogleSheetOrderDocumentsService, GoogleSheetSendOrderService, GoogleSheetIntegrationAdapter],
  exports: [GoogleSheetSendOrderService],
})
export class GoogleSheetModule {}
