import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from "@nestjs/common";
import { Public } from "../../auth/public.decorator";
import type { OrderDocumentsUpdate } from "./google-sheet-order-documents.service";
import { GoogleSheetOrderDocumentsService } from "./google-sheet-order-documents.service";
import { SettingsService } from "../../settings/settings.service";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";

const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

@Controller("integrations/google-sheet")
@RequireModule(ModuleIds.GoogleSheet)
export class GoogleSheetController {
  private readonly logger = new Logger(GoogleSheetController.name);

  constructor(
    private readonly orderDocumentsService: GoogleSheetOrderDocumentsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Incoming push: 1C/Apps Script sends document numbers and dates for an order.
   * Secured by X-Webhook-Secret matching google_sheet.webhookSecretIn.
   */
  @Public()
  @Post("order-documents")
  @HttpCode(HttpStatus.OK)
  async orderDocuments(
    @Headers(WEBHOOK_SECRET_HEADER) secret: string | undefined,
    @Body() body: { orderId: string; invoiceNumber?: string; invoiceDate?: string; waybillNumber?: string; waybillDate?: string },
  ): Promise<{ ok: true }> {
    const { webhookSecretIn } = await this.settings.getGoogleSheetSecrets();
    if (webhookSecretIn && secret !== webhookSecretIn) {
      this.logger.warn("Google Sheet order-documents webhook: invalid or missing secret");
      throw new UnauthorizedException("Invalid webhook secret");
    }

    const orderId = body?.orderId;
    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      throw new BadRequestException("orderId is required");
    }

    const data: OrderDocumentsUpdate = {};
    if (body.invoiceNumber !== undefined) {
      data.invoiceNumber = String(body.invoiceNumber).trim();
    }
    if (body.invoiceDate !== undefined) {
      data.invoiceDate = String(body.invoiceDate).trim();
    }
    if (body.waybillNumber !== undefined) {
      data.waybillNumber = String(body.waybillNumber).trim();
    }
    if (body.waybillDate !== undefined) {
      data.waybillDate = String(body.waybillDate).trim();
    }

    return this.orderDocumentsService.updateOrderDocuments(orderId.trim(), data);
  }
}
