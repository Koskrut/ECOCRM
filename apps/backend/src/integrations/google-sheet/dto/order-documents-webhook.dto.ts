/**
 * Inbound push from 1C / Google Apps Script → CRM.
 *
 * POST /integrations/google-sheet/order-documents
 * Header: X-Webhook-Secret (= settings google_sheet.webhookSecretIn)
 *
 * Body:
 * {
 *   "orderId": "<Order.id, same as sheet dealId / ID сделки>",
 *   "invoiceNumber"?: string,  // empty string clears → null
 *   "invoiceDate"?: string,    // ISO or parseable date; empty clears
 *   "waybillNumber"?: string,
 *   "waybillDate"?: string
 * }
 *
 * Only provided keys are updated (partial). Re-posting same values is idempotent.
 */
export class OrderDocumentsWebhookDto {
  /** CRM Order.id (same as "ID сделки" / dealId in the sheet). */
  orderId!: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  waybillNumber?: string;
  waybillDate?: string;
}
