import test from "node:test";
import assert from "node:assert/strict";
import { resolveDocumentFontPaths } from "../orders-documents-fonts";
import {
  documentHeaderFromOrder,
  OrdersDocumentsService,
} from "../orders-documents.service";

test("resolveDocumentFontPaths finds bundled DejaVu fonts", () => {
  const fonts = resolveDocumentFontPaths();
  assert.match(fonts.regular, /DejaVuSans\.ttf$/);
  assert.match(fonts.bold, /DejaVuSans-Bold\.ttf$/);
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
  assert.notEqual(header.invoiceDate, "—");
  assert.notEqual(header.waybillDate, "—");
});

test("documentHeaderFromOrder placeholders when sheet push has not arrived", () => {
  const header = documentHeaderFromOrder({
    orderNumber: "ORD-1",
    createdAt: new Date("2026-01-01"),
    invoiceNumber: null,
    invoiceDate: null,
    waybillNumber: null,
    waybillDate: null,
  });
  assert.equal(header.invoiceNumber, "—");
  assert.equal(header.invoiceDate, "—");
  assert.equal(header.waybillNumber, "—");
  assert.equal(header.waybillDate, "—");
});

function sampleOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord-1",
    ownerId: "u1",
    orderNumber: "ORD-100",
    createdAt: new Date("2026-03-15T10:00:00.000Z"),
    invoiceNumber: "INV-1C-555",
    invoiceDate: new Date("2026-03-16T00:00:00.000Z"),
    waybillNumber: "RN-1C-777",
    waybillDate: new Date("2026-03-17T00:00:00.000Z"),
    totalAmount: 1500.5,
    currency: "UAH",
    exchangeRate: null,
    contact: {
      id: "c1",
      firstName: "Іван",
      lastName: "Петренко",
      middleName: null,
      documentDisplayName: "ТОВ Тест",
    },
    bankAccount: {
      id: "ba1",
      name: "ФОП",
      iban: "UA643052990000026009016240911",
      documentRequisites: {
        legalName: "ФОП Тестовий",
        iban: "UA643052990000026009016240911",
        mfo: "305299",
        address: "м. Дніпро, вул. Тестова 1",
        edrpou: "1234567890",
        taxId: "1234567890",
      },
    },
    items: [
      {
        qty: 2,
        price: 750.25,
        lineTotal: 1500.5,
        productNameSnapshot: "Товар українською",
        product: { id: "p1", sku: "SKU1", name: "Товар українською" },
      },
    ],
    ...overrides,
  };
}

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
