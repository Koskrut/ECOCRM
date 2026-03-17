/**
 * Body for POST /integrations/google-sheet/order-documents (push from 1C/Apps Script).
 */
export class OrderDocumentsWebhookDto {
  /** CRM Order.id (same as "ID сделки" in the sheet). */
  orderId!: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  waybillNumber?: string;
  waybillDate?: string;
}
