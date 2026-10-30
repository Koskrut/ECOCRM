import test from "node:test";
import assert from "node:assert/strict";
import { resolveDocumentFontPaths } from "../orders-documents-fonts";
import {
  amountToUah,
  buildInvoicePaymentPurpose,
  buildInvoiceWarning,
  buildPublicPayUrl,
  documentHeaderFromOrder,
  formatPayUrlForDisplay,
  formatUaDateLong,
  formatUaMoney,
  formatUaQty,
  invoiceAmountUah,
  OrdersDocumentsService,
  sanitizeDocumentNumber,
} from "../orders-documents.service";

test("resolveDocumentFontPaths finds bundled DejaVu fonts", () => {
  const fonts = resolveDocumentFontPaths();
  assert.match(fonts.regular, /DejaVuSans\.ttf$/);
  assert.match(fonts.bold, /DejaVuSans-Bold\.ttf$/);
});

test("formatUaMoney uses space thousands and comma decimals", () => {
  assert.equal(formatUaMoney(12512.5), "12 512,50");
  assert.equal(formatUaMoney(128038.4), "128 038,40");
  assert.equal(formatUaMoney(45.5), "45,50");
});

test("formatUaQty uses space thousands without decimals", () => {
  assert.equal(formatUaQty(1419), "1 419");
  assert.equal(formatUaQty(50), "50");
});

test("formatUaDateLong uses Ukrainian month names", () => {
  assert.equal(formatUaDateLong(new Date(2026, 9, 12)), "12 жовтня 2026");
});

test("amountToUah converts USD via exchangeRate", () => {
  assert.equal(amountToUah(100, { currency: "USD", exchangeRate: 41.2 }), 4120);
  assert.equal(amountToUah(100, { currency: "UAH", exchangeRate: 41.2 }), 100);
});

test("invoiceAmountUah requires FX rate for USD", () => {
  assert.equal(invoiceAmountUah({ totalAmount: 100, currency: "UAH" }), 100);
  assert.equal(invoiceAmountUah({ totalAmount: 100, currency: "USD", exchangeRate: 40 }), 4000);
  assert.equal(invoiceAmountUah({ totalAmount: 100, currency: "USD", exchangeRate: null }), null);
  assert.equal(invoiceAmountUah({ totalAmount: 0, currency: "UAH" }), null);
});

test("buildInvoicePaymentPurpose embeds order number", () => {
  assert.equal(buildInvoicePaymentPurpose("ORD-100"), "Оплата замовлення ORD-100");
  assert.match(buildInvoiceWarning("ORD-100"), /Оплата замовлення ORD-100/);
  assert.match(buildInvoiceWarning("ORD-100"), /призначенні платежу/i);
});

test("buildPublicPayUrl and formatPayUrlForDisplay shorten links", () => {
  assert.equal(
    buildPublicPayUrl("https://crm.example.com/", "tok_abc"),
    "https://crm.example.com/pay/tok_abc",
  );
  assert.equal(
    formatPayUrlForDisplay("https://crm.example.com/pay/tok_abc"),
    "https://crm.example.com/pay/tok_abc",
  );
  assert.equal(
    formatPayUrlForDisplay("https://bank.gov.ua/qr/QkNECjAwMgoxClVDVAoK0KTQntCfINCa0L7Q"),
    "bank.gov.ua/qr/…",
  );
});

test("sanitizeDocumentNumber strips СУ and leading zeros", () => {
  assert.equal(sanitizeDocumentNumber("СУ00000121"), "121");
  assert.equal(sanitizeDocumentNumber("СУ-00009121"), "9121");
  assert.equal(sanitizeDocumentNumber("00000121"), "121");
  assert.equal(sanitizeDocumentNumber("00000"), "");
  assert.equal(sanitizeDocumentNumber("СУ"), "");
  assert.equal(sanitizeDocumentNumber("СУ00000"), "");
  assert.equal(sanitizeDocumentNumber("121"), "121");
});

test("documentHeaderFromOrder uses Google Sheet / 1C fields on the order", () => {
  const header = documentHeaderFromOrder({
    orderNumber: "ORD-100",
    createdAt: new Date("2026-03-15T10:00:00.000Z"),
    invoiceNumber: "INV-1C-555",
    invoiceDate: new Date("2026-03-16T00:00:00.000Z"),
    waybillNumber: "RN-1C-777",
    waybillDate: new Date("2026-03-17T00:00:00.000Z"),
  });
  assert.equal(header.orderNumber, "ORD-100");
  assert.equal(header.invoiceNumber, "INV-1C-555");
  assert.equal(header.waybillNumber, "RN-1C-777");
  assert.match(header.invoiceDate, /березня 2026/);
  assert.match(header.waybillDate, /березня 2026/);
});

test("documentHeaderFromOrder cleans СУ/zeros and does not use orderNumber when missing", () => {
  const cleaned = documentHeaderFromOrder({
    orderNumber: "ORD-1",
    createdAt: new Date(2026, 0, 1),
    invoiceNumber: "СУ00000121",
    invoiceDate: new Date(2026, 9, 12),
    waybillNumber: "СУ00009121",
    waybillDate: new Date(2026, 9, 12),
  });
  assert.equal(cleaned.invoiceNumber, "121");
  assert.equal(cleaned.waybillNumber, "9121");

  const header = documentHeaderFromOrder({
    orderNumber: "ORD-1",
    createdAt: new Date(2026, 0, 1),
    invoiceNumber: null,
    invoiceDate: null,
    waybillNumber: "00000",
    waybillDate: null,
  });
  assert.equal(header.invoiceNumber, "—");
  assert.equal(header.waybillNumber, "—");
  assert.equal(header.invoiceDate, "—");
  assert.equal(header.waybillDate, "—");
  assert.equal(header.orderNumber, "ORD-1");
});

function sampleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord-1",
    ownerId: "u1",
    orderNumber: "ORD-100",
    createdAt: new Date("2026-03-15T10:00:00.000Z"),
    invoiceNumber: "121",
    invoiceDate: new Date(2026, 9, 12),
    waybillNumber: "9121",
    waybillDate: new Date(2026, 9, 12),
    totalAmount: 1500.5,
    currency: "UAH",
    exchangeRate: null,
    contact: {
      id: "c1",
      firstName: "Анастасія",
      lastName: "Паливода",
      middleName: "Володимирівна",
      documentDisplayName: "ФОП ПАЛИВОДА АНАСТАСІЯ ВОЛОДИМИРІВНА",
    },
    company: {
      id: "co1",
      name: "ФОП ПАЛИВОДА",
      edrpou: null,
      taxId: "3787213089",
    },
    bankAccount: {
      id: "ba1",
      name: "ФОП",
      iban: "UA623052990000026000050606316",
      documentRequisites: {
        legalName: "ФОП Ковальова Юлія Вікторівна",
        iban: "UA623052990000026000050606316",
        mfo: "305299",
        bankName: "Приват",
        address: "49005, Дніпропетровська, м. Дніпро, вул. Лук'яненка Левка, Будинок № 24, Квартира73",
        edrpou: "3195800969",
        taxId: "3195800969",
        taxPayerStatus: "Платник єдиного податку",
      },
    },
    items: [
      {
        qty: 2,
        price: 750.25,
        lineTotal: 1500.5,
        productNameSnapshot: "Товар українською",
        product: { id: "p1", sku: "MG-AR-PMA", name: "Товар українською", unit: "шт" },
      },
    ],
    ...overrides,
  };
}

test("buildInvoicePaymentBlock returns NBU QR for sample order", async () => {
  const service = new OrdersDocumentsService({} as any);
  const block = await service.buildInvoicePaymentBlock(sampleOrder() as any);
  assert.ok(block);
  assert.equal(block!.purpose, "Оплата замовлення ORD-100");
  assert.match(block!.nbuDeeplink, /^https:\/\/bank\.gov\.ua\/qr\//);
  assert.ok(block!.qrPng.length > 100);
  assert.equal(block!.amountUah, 1500.5);
});

test("buildInvoicePaymentBlock prefers short CRM /pay/ URL when configured", async () => {
  const prisma = {
    paymentRequest: {
      findMany: async () => [
        {
          status: "PENDING",
          expiresAt: new Date(Date.now() + 86400000),
          publicToken: "shorttok",
        },
      ],
    },
  };
  const paymentRequests = {} as any;
  const settings = {
    getStoreConfig: async () => ({ crmPayPageUrl: "https://crm.example.com" }),
  };
  const service = new OrdersDocumentsService(prisma as any, paymentRequests, settings as any);
  const block = await service.buildInvoicePaymentBlock(sampleOrder() as any);
  assert.ok(block);
  assert.equal(block!.payUrl, "https://crm.example.com/pay/shorttok");
  assert.equal(formatPayUrlForDisplay(block!.payUrl), "https://crm.example.com/pay/shorttok");
});

test("buildInvoicePdf produces valid PDF with Cyrillic font embedded", async () => {
  const service = new OrdersDocumentsService({} as any);
  const pdf = await service.buildInvoicePdfFromOrder(sampleOrder() as any);
  assert.ok(pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-"));
  assert.ok(pdf.toString("latin1").includes("DejaVu"), "Cyrillic-capable font must be embedded");
  assert.ok(pdf.length > 5000, "PDF with embedded font should not be tiny");
});

test("buildWaybillPdf produces valid PDF with Cyrillic font embedded", async () => {
  const service = new OrdersDocumentsService({} as any);
  const pdf = await service.buildWaybillPdfFromOrder(sampleOrder() as any);
  assert.ok(pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-"));
  assert.ok(pdf.toString("latin1").includes("DejaVu"), "Cyrillic-capable font must be embedded");
});

test("PDF still builds when sheet numbers are missing", async () => {
  const service = new OrdersDocumentsService({} as any);
  const pdf = await service.buildInvoicePdfFromOrder(
    sampleOrder({ invoiceNumber: null, invoiceDate: null }) as any,
  );
  assert.ok(pdf.subarray(0, 5).toString("latin1").startsWith("%PDF-"));
});
