import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { SettingsModule } from "../../settings/settings.module";
import { GoogleSheetController } from "./google-sheet.controller";
import { GoogleSheetOrderDocumentsService } from "./google-sheet-order-documents.service";
import { GoogleSheetSendOrderService } from "./google-sheet-send-order.service";

@Module({
  imports: [PrismaModule, SettingsModule],
  controllers: [GoogleSheetController],
  providers: [GoogleSheetOrderDocumentsService, GoogleSheetSendOrderService],
  exports: [GoogleSheetSendOrderService],
})
export class GoogleSheetModule {}
