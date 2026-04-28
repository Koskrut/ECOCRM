import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import {
  IntegrationPortsService,
  type OrderSheetExportOptions,
} from "../../integration-ports/integration-ports.service";
import { GoogleSheetSendOrderService } from "./google-sheet-send-order.service";

@Injectable()
export class GoogleSheetIntegrationAdapter implements OnModuleInit {
  constructor(
    @Inject(IntegrationPortsService) private readonly ports: IntegrationPortsService,
    @Inject(GoogleSheetSendOrderService) private readonly googleSheet: GoogleSheetSendOrderService,
  ) {}

  onModuleInit(): void {
    this.ports.registerOrderSheetExporter(this);
  }

  sendOrderToSheet(orderId: string, options: OrderSheetExportOptions) {
    return this.googleSheet.sendOrderToSheet(orderId, options);
  }
}
