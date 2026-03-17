import { Injectable, Logger } from "@nestjs/common";
import type { OrderStatus, PaymentMethod } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";

/**
 * Payload sent to Google Apps Script (POST JSON).
 * Script must write rows in this exact column order (one row per item):
 * 1. Дата
 * 2. ID сделки в 1С (dealId)
 * 3. ответственный (как Id контакта в 1С) (responsibleFullName)
 * 4. Код контрагента в 1С (counterpartyCode1C)
 * 5. форма оплаты (paymentMethod)
 * 6. ФОП (fopCode)
 * 7. Склад (warehouseCode)
 * 8. продукция (Артикул) (item.sku)
 * 9. продукция (кол-во) (item.qty)
 * 10. продукция (цена) (item.price)
 * 11. курс (exchangeRate)
 * 12. Статус (status)
 * 13–16. Номер РН, Дата РН, Номер Счета, Дата Счета — пусто (заполняет 1С).
 */
export type GoogleSheetOrderPayload = {
  date: string;
  dealId: string;
  responsibleFullName: string;
  contactId: string | null;
  counterpartyCode1C: string | null;
  paymentMethod: string | null;
  fopCode: string | null;
  warehouseCode: string | null;
  items: Array<{ sku: string; qty: number; price: number }>;
  exchangeRate: number | null;
  status: OrderStatus;
};

const SEND_ORDER_INCLUDE = {
  company: true,
  client: true,
  contact: true,
  owner: { select: { id: true, fullName: true } },
  bankAccount: { select: { id: true, name: true, externalCode: true } },
  warehouse: { select: { id: true, name: true, externalCode: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true } } } },
} as const;

@Injectable()
export class GoogleSheetSendOrderService {
  private readonly logger = new Logger(GoogleSheetSendOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Build payload for Apps Script webhook (no document numbers/dates).
   */
  async buildPayload(orderId: string): Promise<GoogleSheetOrderPayload | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: SEND_ORDER_INCLUDE,
    });
    if (!order) return null;

    const contact = order.contact ?? order.client;
    const responsibleFullName = (order.owner as { fullName?: string } | null)?.fullName ?? "";
    const counterpartyCode1C = contact
      ? ((contact as { externalCode?: string | null }).externalCode ?? null)
      : null;
    const contactId = contact ? (contact as { id: string }).id : null;
    const fopCode = order.bankAccount
      ? (order.bankAccount as { externalCode?: string | null }).externalCode ?? null
      : null;
    const warehouseCode = order.warehouse
      ? (order.warehouse as { externalCode?: string | null }).externalCode ?? null
      : null;

    const items = order.items.map((it: { product: { sku?: string } | null; productNameSnapshot?: string | null; qty: number; price: number }) => {
      const product = it.product;
      const sku = product?.sku ?? it.productNameSnapshot ?? "";
      return {
        sku,
        qty: it.qty,
        price: it.price,
      };
    });

    return {
      date: (order.createdAt as Date).toISOString(),
      dealId: order.id,
      responsibleFullName,
      contactId,
      counterpartyCode1C,
      paymentMethod: order.paymentMethod as PaymentMethod | null,
      fopCode,
      warehouseCode,
      items,
      exchangeRate: order.exchangeRate ?? null,
      status: order.status as OrderStatus,
    };
  }

  /**
   * Send order payload to Google Sheet webhook. No-op if URL not configured.
   */
  async sendOrderToSheet(orderId: string): Promise<void> {
    const { webhookUrl, webhookSecretOut } = await this.settings.getGoogleSheetSecrets();
    if (!webhookUrl || !webhookUrl.trim()) {
      this.logger.debug("Google Sheet webhook URL not configured, skip send");
      return;
    }

    const payload = await this.buildPayload(orderId);
    if (!payload) {
      this.logger.warn(`Order ${orderId} not found for send-to-sheet`);
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (webhookSecretOut) {
      headers["X-Webhook-Secret"] = webhookSecretOut;
    }

    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Google Sheet webhook failed ${res.status} for order ${orderId}: ${text}`);
      throw new Error(`Google Sheet webhook failed: ${res.status}`);
    }
    this.logger.log(`Sent order ${orderId} to Google Sheet`);
  }
}
