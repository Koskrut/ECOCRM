import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { effectivePaymentRequestStatus } from "../payment-requests/payment-request-public.mapper";
import { PaymentRequestsService } from "../payment-requests/payment-requests.service";
import { buildNbuPaymentDeeplink } from "../payment-requests/nbu-qr";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { resolveDocumentFontPaths } from "./orders-documents-fonts";

const ORDER_DOCUMENTS_INCLUDE = {
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      documentDisplayName: true,
    },
  },
  company: {
    select: {
      id: true,
      name: true,
      edrpou: true,
      taxId: true,
    },
  },
  bankAccount: {
    select: {
      id: true,
      name: true,
      iban: true,
      documentRequisites: true,
    },
  },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
    },
  },
} as const;

export type OrderForDocument = Prisma.OrderGetPayload<{ include: typeof ORDER_DOCUMENTS_INCLUDE }>;

export type DocumentRequisites = {
  legalName?: string;
  taxId?: string;
  address?: string;
  bankDetails?: string;
  /** Р/р для блоку "П/р UA..., Банк Приват, МФО ..." */
  iban?: string;
  /** МФО банку (напр. 305299) */
  mfo?: string;
  /** Код ЄДРПОУ */
  edrpou?: string;
  /** Напр. "Платник єдиного податку" */
  taxPayerStatus?: string;
  /** Коротке ім'я банку в зразку платіжки (напр. "Приват") */
  bankName?: string;
};

/** Layout aligned to 1C A4 templates (invoice №121 / waybill №9121). */
const PAGE = { width: 595.28, height: 841.89 };
const L = 28;
const R = 533;
const W = R - L;
const TOP = 26;
const BOTTOM = 36;

/** Goods table verticals: № | Артикул | Товари | Кіл-сть | Од. | Ціна | Сума */
const TX = [L, 53, 126, 345, 380, 413, 469, R] as const;

export function buildInvoicePaymentPurpose(orderNumber: string): string {
  const n = orderNumber.trim() || "—";
  return `Оплата замовлення ${n}`;
}

export function buildInvoiceWarning(orderNumber: string): string {
  const purpose = buildInvoicePaymentPurpose(orderNumber);
  return (
    "Увага! Оплата цього рахунку означає згоду Покупця з умовами постачання товару. " +
    'При переказі коштів обов\'язково вказувати "за мед.вироби" (або назву товару), ' +
    `номер і дату Рахунку на оплату та номер замовлення. ` +
    `У призначенні платежу вкажіть: «${purpose}». ` +
    "Повідомлення про оплату обов'язкове, інакше не гарантується наявність товара на складі. " +
    "Товар відвантажується по факту зарахування грошей на рахунок Постачальника, " +
    "самовивозом, при наявності довіреності та паспорта."
  );
}

export type InvoicePaymentBlock = {
  purpose: string;
  /** Short CRM pay page URL (or compact fallback label target). */
  payUrl: string;
  /** NBU deeplink encoded in the QR (for banking apps). */
  nbuDeeplink: string;
  amountUah: number;
  qrPng: Buffer;
};

/** Absolute public pay URL: `{crmPayPageUrl}/pay/{token}`. */
export function buildPublicPayUrl(crmPayPageUrl: string, publicToken: string): string {
  const base = crmPayPageUrl.trim().replace(/\/+$/, "");
  const token = publicToken.trim();
  return `${base}/pay/${token}`;
}

/** Visible label for the pay link — never dump the long NBU base64 URL. */
export function formatPayUrlForDisplay(payUrl: string): string {
  const u = payUrl.trim();
  if (!u) return "";
  if (/\/pay\/[^/?#]+/i.test(u) && !/bank\.gov\.ua/i.test(u)) return u;
  if (/bank\.gov\.ua\/qr\//i.test(u)) return "bank.gov.ua/qr/…";
  return u.length > 60 ? `${u.slice(0, 48)}…` : u;
}

const MONTHS_UK = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
] as const;

/**
 * Strip 1C noise from document numbers for PDF: «СУ» prefix and leading zeros.
 * «СУ00000121» → «121», «00000» / «СУ» alone → empty (shown as «—»).
 */
export function sanitizeDocumentNumber(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim();
  if (!s) return "";
  // Drop Cyrillic «СУ» / Latin «CY» / «SU» prefix (1C series marker), optionally with separators.
  s = s.replace(/^(?:СУ|CY|SU)[\s\-/_]*/iu, "");
  // Leading zeros only (keep at least one significant digit if any remain).
  s = s.replace(/^0+(?=\d)/, "");
  // Pure zeros / empty after cleanup → treat as missing.
  if (!s || /^0+$/.test(s)) return "";
  return s.trim();
}

/**
 * Numbers/dates for PDF header — only from Google Sheet / 1C push fields on Order.
 * Do NOT fall back to CRM orderNumber: 1C writes invoice/waybill numbers asynchronously.
 */
export function documentHeaderFromOrder(order: {
  orderNumber: string;
  createdAt: Date | string | null;
  invoiceNumber?: string | null;
  invoiceDate?: Date | string | null;
  waybillNumber?: string | null;
  waybillDate?: Date | string | null;
}): {
  orderNumber: string;
  orderDate: string;
  invoiceNumber: string;
  invoiceDate: string;
  waybillNumber: string;
  waybillDate: string;
} {
  const invoiceNumber = sanitizeDocumentNumber(order.invoiceNumber);
  const waybillNumber = sanitizeDocumentNumber(order.waybillNumber);
  return {
    orderNumber: order.orderNumber,
    orderDate: formatUaDateLong(order.createdAt) || "—",
    invoiceNumber: invoiceNumber || "—",
    // Date only from 1C when the matching document number exists.
    invoiceDate: invoiceNumber
      ? formatUaDateLong(order.invoiceDate) || "—"
      : "—",
    waybillNumber: waybillNumber || "—",
    waybillDate: waybillNumber
      ? formatUaDateLong(order.waybillDate) || "—"
      : "—",
  };
}

/** «12 жовтня 2026» */
export function formatUaDateLong(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS_UK[date.getMonth()]} ${date.getFullYear()}`;
}

/** «12 512,50» */
export function formatUaMoney(value: number): string {
  const fixed = (Math.round(Number(value) * 100) / 100).toFixed(2);
  const [intPart, frac] = fixed.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${withSpaces},${frac}`;
}

/** Integer qty with thousand spaces: «1 419» */
export function formatUaQty(value: number): string {
  const n = Math.round(Number(value) || 0);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function amountToUah(
  amount: number,
  order: { currency: string; exchangeRate?: number | null },
): number {
  const cur = String(order.currency ?? "").toUpperCase();
  const rate = order.exchangeRate != null ? Number(order.exchangeRate) : NaN;
  if ((cur === "USD" || cur === "EUR") && Number.isFinite(rate) && rate > 0) {
    return amount * rate;
  }
  return amount;
}

/** Invoice QR amount in UAH, or null when FX rate is missing for USD/EUR / amount ≤ 0. */
export function invoiceAmountUah(order: {
  totalAmount: number;
  currency: string;
  exchangeRate?: number | null;
}): number | null {
  const total = Number(order.totalAmount) || 0;
  if (total <= 0) return null;
  const cur = String(order.currency ?? "").toUpperCase();
  if (cur === "UAH" || cur === "₴") {
    return Math.round(total * 100) / 100;
  }
  if (cur === "USD" || cur === "EUR") {
    const rate = order.exchangeRate != null ? Number(order.exchangeRate) : NaN;
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return Math.round(total * rate * 100) / 100;
  }
  // Other currencies: pass through as-is only if already treated as UAH-like.
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;
type Fonts = { regular: string; bold: string };

@Injectable()
export class OrdersDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly paymentRequests?: PaymentRequestsService,
    @Optional() private readonly settings?: SettingsService,
  ) {}

  private assertOrderAccess(order: { ownerId: string }, actor: AuthUser | undefined): void {
    if (!actor) return;
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private buyerName(contact: {
    documentDisplayName?: string | null;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  } | null): string {
    if (!contact) return "—";
    if (contact.documentDisplayName?.trim()) return contact.documentDisplayName.trim();
    const parts = [contact.lastName, contact.firstName, contact.middleName].filter(Boolean);
    return parts.join(" ") || "—";
  }

  private buyerLine(
    contact: OrderForDocument["contact"],
    company: OrderForDocument["company"],
  ): string {
    const name = this.buyerName(contact);
    if (name === "—" && company?.name?.trim()) {
      const tax = company.taxId?.trim() || company.edrpou?.trim();
      return tax ? `${company.name.trim()}, РНОКПП ${tax}` : company.name.trim();
    }
    const tax = company?.taxId?.trim() || company?.edrpou?.trim();
    return tax ? `${name}, РНОКПП ${tax}` : name;
  }

  private sellerLines(
    requisites: DocumentRequisites | null,
    bankAccountIban?: string | null,
  ): string[] {
    if (!requisites) return ["—"];
    const iban = requisites.iban?.replace(/\s/g, "") || bankAccountIban?.replace(/\s/g, "") || "";
    const mfo = requisites.mfo?.trim() || "305299";
    const bankName = requisites.bankName?.trim() || "Приват";
    const hasNewFormat = iban || requisites.address || requisites.edrpou != null;
    if (hasNewFormat) {
      const lines: string[] = [];
      if (requisites.legalName?.trim()) lines.push(requisites.legalName.trim());
      if (iban) lines.push(`П/р ${iban}, Банк ${bankName}, МФО ${mfo}`);
      if (requisites.address?.trim()) lines.push(`Юр. адреса: ${requisites.address.trim()}`);
      const edrpou = requisites.edrpou?.trim();
      const taxId = requisites.taxId?.trim();
      if (edrpou || taxId) {
        lines.push(
          [edrpou ? `код за ЄДРПОУ ${edrpou}` : "", taxId ? `ІПН ${taxId}` : ""]
            .filter(Boolean)
            .join(", "),
        );
      }
      lines.push(requisites.taxPayerStatus?.trim() || "Платник єдиного податку");
      return lines.length ? lines : ["—"];
    }
    const lines: string[] = [];
    if (requisites.legalName) lines.push(requisites.legalName);
    if (requisites.taxId) lines.push(`ІПН: ${requisites.taxId}`);
    if (requisites.address) lines.push(requisites.address);
    if (requisites.bankDetails) lines.push(requisites.bankDetails);
    return lines.length ? lines : ["—"];
  }

  private sellerMeta(
    requisites: DocumentRequisites | null,
    bankAccountIban?: string | null,
  ): {
    legalName: string;
    iban: string;
    mfo: string;
    bankName: string;
    edrpou: string;
  } {
    const iban =
      requisites?.iban?.replace(/\s/g, "") || bankAccountIban?.replace(/\s/g, "") || "";
    return {
      legalName: requisites?.legalName?.trim() || "—",
      iban,
      mfo: requisites?.mfo?.trim() || "305299",
      bankName: requisites?.bankName?.trim() || "Приват",
      edrpou: requisites?.edrpou?.trim() || requisites?.taxId?.trim() || "",
    };
  }

  async getOrderForDocument(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_DOCUMENTS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertOrderAccess(order, actor);
    return order;
  }

  private registerFonts(doc: PdfDoc): Fonts {
    const fonts = resolveDocumentFontPaths();
    doc.registerFont("DocSans", fonts.regular);
    doc.registerFont("DocSans-Bold", fonts.bold);
    doc.font("DocSans");
    return { regular: "DocSans", bold: "DocSans-Bold" };
  }

  private async renderPdf(draw: (doc: PdfDoc) => void): Promise<Buffer> {
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: TOP, bottom: BOTTOM, left: L, right: PAGE.width - R },
    });
    doc.lineWidth(0.6);
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      doc.on("end", () => resolve());
      doc.on("error", reject);
      draw(doc);
      doc.end();
    });
    return Buffer.concat(chunks);
  }

  async buildInvoicePdf(orderId: string, actor?: AuthUser): Promise<Buffer> {
    const order = await this.getOrderForDocument(orderId, actor);
    const payment = await this.buildInvoicePaymentBlock(order);
    return this.renderPdf((doc) => this.drawInvoice(doc, order, payment));
  }

  async buildWaybillPdf(orderId: string, actor?: AuthUser): Promise<Buffer> {
    const order = await this.getOrderForDocument(orderId, actor);
    return this.renderPdf((doc) => this.drawWaybill(doc, order));
  }

  async buildInvoicePdfFromOrder(order: OrderForDocument): Promise<Buffer> {
    const payment = await this.buildInvoicePaymentBlock(order);
    return this.renderPdf((doc) => this.drawInvoice(doc, order, payment));
  }

  async buildWaybillPdfFromOrder(order: OrderForDocument): Promise<Buffer> {
    return this.renderPdf((doc) => this.drawWaybill(doc, order));
  }

  /**
   * NBU QR + short CRM pay link for the invoice.
   * Returns null when requisites/amount are incomplete (PDF still builds without the block).
   */
  async buildInvoicePaymentBlock(order: OrderForDocument): Promise<InvoicePaymentBlock | null> {
    const requisites = (order.bankAccount?.documentRequisites as DocumentRequisites | null) ?? null;
    const meta = this.sellerMeta(requisites, order.bankAccount?.iban ?? null);
    const amountUah = invoiceAmountUah(order);
    if (!amountUah || !meta.iban || !meta.legalName || meta.legalName === "—" || !meta.edrpou) {
      return null;
    }
    const codeDigits = meta.edrpou.replace(/\D/g, "");
    if (codeDigits.length !== 8 && codeDigits.length !== 10) return null;

    const purpose = buildInvoicePaymentPurpose(order.orderNumber);
    try {
      const nbuDeeplink = buildNbuPaymentDeeplink({
        recipientName: meta.legalName.slice(0, 70),
        iban: meta.iban,
        receiverCode: codeDigits,
        currency: "UAH",
        amount: amountUah,
        purpose,
        displayText: `Замовлення ${order.orderNumber}`.slice(0, 70),
      });
      const payUrl =
        (await this.resolveShortPayUrl(order, amountUah, purpose)) ?? nbuDeeplink;
      const QR = await import("qrcode");
      const qrPng = await QR.toBuffer(nbuDeeplink, {
        type: "png",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 180,
      });
      return { purpose, payUrl, nbuDeeplink, amountUah, qrPng: Buffer.from(qrPng) };
    } catch {
      return null;
    }
  }

  /**
   * Prefer existing PENDING payment request; otherwise create one (30 days).
   * Needs Settings.crmPayPageUrl + PaymentRequestsService.
   */
  private async resolveShortPayUrl(
    order: OrderForDocument,
    amountUah: number,
    purpose: string,
  ): Promise<string | null> {
    if (!this.paymentRequests || !this.settings || !order.id) return null;

    let base = "";
    try {
      const store = await this.settings.getStoreConfig();
      base = (store.crmPayPageUrl ?? "").trim().replace(/\/+$/, "");
    } catch {
      return null;
    }
    if (!base) return null;

    try {
      const now = new Date();
      const existing = await this.prisma.paymentRequest.findMany({
        where: { orderId: order.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      for (const row of existing) {
        if (effectivePaymentRequestStatus(row, now) === "PENDING") {
          return buildPublicPayUrl(base, row.publicToken);
        }
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      expiresAt.setHours(23, 59, 59, 999);

      const created = await this.paymentRequests.create(order.id, {
        amount: amountUah,
        purpose,
        expiresAt: expiresAt.toISOString(),
        displayText: `Замовлення ${order.orderNumber}`.slice(0, 70),
      });
      return buildPublicPayUrl(base, created.publicToken);
    } catch {
      return null;
    }
  }

  private drawInvoice(
    doc: PdfDoc,
    order: OrderForDocument,
    payment: InvoicePaymentBlock | null,
  ) {
    const fonts = this.registerFonts(doc);
    const requisites = (order.bankAccount?.documentRequisites as DocumentRequisites | null) ?? null;
    const seller = this.sellerLines(requisites, order.bankAccount?.iban ?? null);
    const meta = this.sellerMeta(requisites, order.bankAccount?.iban ?? null);
    const buyer = this.buyerLine(order.contact, order.company);
    const header = documentHeaderFromOrder(order);

    doc.fillColor("#000").strokeColor("#000");
    doc.font(fonts.regular).fontSize(7.5);
    doc.text(buildInvoiceWarning(order.orderNumber), L, TOP, {
      width: W,
      align: "left",
      lineGap: 0.8,
    });

    this.drawPaymentSlipSample(doc, fonts, meta, doc.y + 6);

    doc.y += 14;
    doc.font(fonts.bold).fontSize(12);
    doc.text(
      `Рахунок на оплату № ${header.invoiceNumber} від ${header.invoiceDate}`,
      L,
      doc.y,
      { width: W, align: "center" },
    );

    doc.y += 10;
    this.drawParties(doc, fonts, seller, buyer);
    this.drawGoodsTable(doc, fonts, order);
    this.drawTotalsBlock(doc, fonts, order);

    if (payment) {
      this.drawInvoicePaymentBlock(doc, fonts, payment, order.orderNumber);
    }

    doc.y += 18;
    doc.font(fonts.regular).fontSize(10);
    const sigY = doc.y;
    doc.text("Виписав(ла):", L, sigY);
    doc
      .moveTo(L + 72, sigY + 10)
      .lineTo(L + 260, sigY + 10)
      .stroke();
  }

  private drawInvoicePaymentBlock(
    doc: PdfDoc,
    fonts: Fonts,
    payment: InvoicePaymentBlock,
    orderNumber: string,
  ) {
    this.ensureSpace(doc, 120);
    doc.y += 12;
    const top = doc.y;
    const qrSize = 88;
    const gap = 10;
    const textX = L + qrSize + gap;
    const textW = R - textX;

    doc.image(payment.qrPng, L, top, { width: qrSize, height: qrSize });

    let y = top;
    doc.font(fonts.bold).fontSize(9);
    doc.text("Оплата за QR / посиланням", textX, y, { width: textW });
    y = doc.y + 3;

    doc.font(fonts.regular).fontSize(8);
    doc.text(
      `Сума: ${formatUaMoney(payment.amountUah)} грн. Відскануйте QR у застосунку банку або відкрийте посилання.`,
      textX,
      y,
      { width: textW },
    );
    y = doc.y + 4;

    doc.font(fonts.bold).fontSize(8);
    doc.text("Призначення платежу:", textX, y, { width: textW, continued: true });
    doc.font(fonts.regular).fontSize(8);
    doc.text(` ${payment.purpose}`, { width: textW });
    y = doc.y + 3;

    doc.font(fonts.bold).fontSize(8);
    doc.text(
      `У призначенні платежу обов'язково вкажіть замовлення ${orderNumber}.`,
      textX,
      y,
      { width: textW },
    );
    y = doc.y + 4;

    doc.font(fonts.regular).fontSize(8);
    doc.fillColor("#000");
    doc.text("Посилання для оплати:", textX, y, { width: textW });
    y = doc.y + 1;
    const linkLabel = formatPayUrlForDisplay(payment.payUrl);
    doc.fillColor("#003399").fontSize(8);
    doc.text(linkLabel, textX, y, {
      width: textW,
      link: payment.payUrl,
      underline: true,
    });
    doc.fillColor("#000");

    doc.y = Math.max(top + qrSize, doc.y) + 4;
  }

  private drawWaybill(doc: PdfDoc, order: OrderForDocument) {
    const fonts = this.registerFonts(doc);
    const requisites = (order.bankAccount?.documentRequisites as DocumentRequisites | null) ?? null;
    const seller = this.sellerLines(requisites, order.bankAccount?.iban ?? null);
    const buyer = this.buyerLine(order.contact, order.company);
    const header = documentHeaderFromOrder(order);

    doc.fillColor("#000").strokeColor("#000");
    doc.font(fonts.bold).fontSize(12);
    doc.text(
      `Видаткова накладна № ${header.waybillNumber} від ${header.waybillDate}`,
      L,
      TOP + 6,
      { width: W, align: "center" },
    );

    doc.y += 12;
    this.drawParties(doc, fonts, seller, buyer);
    this.drawGoodsTable(doc, fonts, order);
    this.drawTotalsBlock(doc, fonts, order);
    this.drawWaybillSignatures(doc, fonts);
  }

  /**
   * Classic 1C payment-order sample:
   *  ┌──────────────┬────────────────────────────┬──────┬──────────────┐
   *  │ Одержувач    │ Name                       │ Код  │ EDRPOU       │
   *  ├──────────────┼────────────────────────────┴──────┴──────────────┤
   *  │ Банк         │ КРЕДИТ рах. N                                    │
   *  │ одержувача   │ IBAN                                             │
   *  │              ├────────────────────────────┬──────┬──────────────┤
   *  │ BankName     │                            │ Код  │ MFO          │
   *  │              │                            │банку │              │
   *  └──────────────┴────────────────────────────┴──────┴──────────────┘
   */
  private drawPaymentSlipSample(
    doc: PdfDoc,
    fonts: Fonts,
    meta: { legalName: string; iban: string; mfo: string; bankName: string; edrpou: string },
    top: number,
  ) {
    const x0 = L;
    const x1 = 92; // label column
    const x2 = 360; // before Код
    const x3 = 400; // before code value
    const x4 = R;
    const titleH = 15;
    const row1 = 18;
    const rowCredit = 28;
    const rowBank = 18;
    const h = titleH + row1 + rowCredit + rowBank;
    const y0 = top;
    const y1 = y0 + titleH;
    const y2 = y1 + row1;
    const y3 = y2 + rowCredit;
    const y4 = y3 + rowBank;

    doc.rect(x0, y0, x4 - x0, h).stroke();
    doc.moveTo(x0, y1).lineTo(x4, y1).stroke();
    doc.font(fonts.bold).fontSize(9);
    doc.text("Зразок заповнення платіжного доручення", x0, y0 + 3.5, {
      width: x4 - x0,
      align: "center",
    });

    // Verticals
    doc.moveTo(x1, y1).lineTo(x1, y4).stroke();
    // Row 1 horizontals/verticals
    doc.moveTo(x0, y2).lineTo(x4, y2).stroke();
    doc.moveTo(x2, y1).lineTo(x2, y2).stroke();
    doc.moveTo(x3, y1).lineTo(x3, y2).stroke();
    // Credit / bank split
    doc.moveTo(x0, y3).lineTo(x4, y3).stroke();
    doc.moveTo(x2, y3).lineTo(x2, y4).stroke();
    doc.moveTo(x3, y3).lineTo(x3, y4).stroke();

    doc.font(fonts.regular).fontSize(8);

    this.cellText(doc, "Одержувач", x0 + 3, y1, x1 - x0 - 6, row1, {
      align: "left",
      valign: "center",
    });
    this.cellText(doc, meta.legalName, x1 + 4, y1, x2 - x1 - 8, row1, {
      align: "left",
      valign: "center",
    });
    this.cellText(doc, "Код", x2 + 3, y1, x3 - x2 - 6, row1, {
      align: "center",
      valign: "center",
    });
    this.cellText(doc, meta.edrpou || "—", x3 + 4, y1, x4 - x3 - 8, row1, {
      align: "left",
      valign: "center",
    });

    // Left bank label spanning credit+bank rows
    this.cellText(doc, "Банк\nодержувача", x0 + 3, y2, x1 - x0 - 6, rowCredit + rowBank, {
      align: "left",
      valign: "center",
    });
    doc.font(fonts.regular).fontSize(7.5);
    this.cellText(doc, "КРЕДИТ рах. N", x1 + 4, y2 + 2, x4 - x1 - 8, 10, { align: "left" });
    doc.font(fonts.regular).fontSize(8.5);
    this.cellText(doc, meta.iban || "—", x1 + 4, y2 + 12, x4 - x1 - 8, 14, { align: "left" });

    doc.font(fonts.regular).fontSize(8);
    this.cellText(doc, meta.bankName, x1 + 4, y3, x2 - x1 - 8, rowBank, {
      align: "left",
      valign: "center",
    });
    this.cellText(doc, "Код банку", x2 + 2, y3, x3 - x2 - 4, rowBank, {
      align: "center",
      valign: "center",
    });
    this.cellText(doc, meta.mfo, x3 + 4, y3, x4 - x3 - 8, rowBank, {
      align: "left",
      valign: "center",
    });

    doc.y = y4;
  }

  private drawParties(doc: PdfDoc, fonts: Fonts, seller: string[], buyer: string) {
    doc.font(fonts.bold).fontSize(9);
    doc.text("Постачальник:", L, doc.y);
    doc.font(fonts.regular).fontSize(8.5);
    for (const line of seller) {
      doc.text(line, L, doc.y, { width: W, lineGap: 1 });
    }
    doc.y += 6;
    doc.font(fonts.bold).fontSize(9);
    doc.text("Покупець:", L, doc.y);
    doc.font(fonts.regular).fontSize(8.5);
    doc.text(buyer, L, doc.y, { width: W });
    doc.y += 8;
  }

  private ensureSpace(doc: PdfDoc, needed: number): boolean {
    if (doc.y + needed <= PAGE.height - BOTTOM) return false;
    doc.addPage();
    doc.lineWidth(0.6);
    doc.y = TOP;
    return true;
  }

  private drawGrid(doc: PdfDoc, top: number, h: number, xs: readonly number[]) {
    doc.rect(xs[0], top, xs[xs.length - 1] - xs[0], h).stroke();
    for (let i = 1; i < xs.length - 1; i++) {
      doc.moveTo(xs[i], top).lineTo(xs[i], top + h).stroke();
    }
  }

  private cellText(
    doc: PdfDoc,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opts: { align?: "left" | "center" | "right"; valign?: "top" | "center"; size?: number } = {},
  ) {
    const align = opts.align ?? "left";
    const textH = doc.heightOfString(text, { width: w, align });
    let ty = y + 2;
    if (opts.valign === "center") {
      ty = y + Math.max(1, (h - textH) / 2);
    }
    doc.text(text, x, ty, {
      width: w,
      align,
      lineBreak: true,
    });
  }

  private drawTableHeader(doc: PdfDoc, fonts: Fonts) {
    const top = doc.y;
    const h = 22;
    this.drawGrid(doc, top, h, TX);
    doc.font(fonts.bold).fontSize(7.5);
    const labels: Array<{ i: number; text: string }> = [
      { i: 0, text: "№" },
      { i: 1, text: "Артикул" },
      { i: 2, text: "Товари (роботи, послуги)" },
      { i: 3, text: "Кіл-сть" },
      { i: 4, text: "Од." },
      { i: 5, text: "Ціна без\nПДВ" },
      { i: 6, text: "Сума без\nПДВ" },
    ];
    for (const { i, text } of labels) {
      this.cellText(doc, text, TX[i] + 1, top, TX[i + 1] - TX[i] - 2, h, {
        align: "center",
        valign: "center",
      });
    }
    doc.y = top + h;
  }

  private drawGoodsTable(doc: PdfDoc, fonts: Fonts, order: OrderForDocument) {
    this.ensureSpace(doc, 50);
    this.drawTableHeader(doc, fonts);

    order.items.forEach((item, idx) => {
      const sku = item.product?.sku ?? "—";
      const name = item.product?.name ?? item.productNameSnapshot ?? "—";
      const unit = item.product?.unit?.trim() || "шт";
      const qty = Number(item.qty) || 0;
      const priceUah = amountToUah(Number(item.price) || 0, order);
      const sumUah = amountToUah(Number(item.lineTotal) || 0, order);

      doc.font(fonts.regular).fontSize(7.5);
      const nameH = doc.heightOfString(name, { width: TX[3] - TX[2] - 4 });
      const skuH = doc.heightOfString(sku, { width: TX[2] - TX[1] - 4 });
      const rowH = Math.max(14, nameH + 4, skuH + 4);

      if (this.ensureSpace(doc, rowH + 2)) {
        this.drawTableHeader(doc, fonts);
      }

      const top = doc.y;
      this.drawGrid(doc, top, rowH, TX);

      const cells: Array<{ i: number; text: string; align: "left" | "center" | "right" }> = [
        { i: 0, text: String(idx + 1), align: "center" },
        { i: 1, text: sku, align: "left" },
        { i: 2, text: name, align: "left" },
        { i: 3, text: formatUaQty(qty), align: "right" },
        { i: 4, text: unit, align: "center" },
        { i: 5, text: formatUaMoney(priceUah), align: "right" },
        { i: 6, text: formatUaMoney(sumUah), align: "right" },
      ];
      for (const c of cells) {
        this.cellText(doc, c.text, TX[c.i] + 2, top, TX[c.i + 1] - TX[c.i] - 4, rowH, {
          align: c.align,
          valign: "center",
        });
      }
      doc.y = top + rowH;
    });
  }

  private drawTotalsBlock(doc: PdfDoc, fonts: Fonts, order: OrderForDocument) {
    const totalQty = order.items.reduce((acc, item) => acc + (Number(item.qty) || 0), 0);
    const totalUah = amountToUah(Number(order.totalAmount) || 0, order);
    const namesCount = order.items.length;

    const top = doc.y;
    const h = 16;
    // Only rightmost cell bordered like 1C (Разом label + sum)
    doc.rect(TX[5], top, R - TX[5], h).stroke();
    doc.moveTo(TX[6], top).lineTo(TX[6], top + h).stroke();
    doc.font(fonts.bold).fontSize(8.5);
    this.cellText(doc, "Разом:", TX[5] + 2, top, TX[6] - TX[5] - 4, h, {
      align: "right",
      valign: "center",
    });
    this.cellText(doc, formatUaMoney(totalUah), TX[6] + 2, top, R - TX[6] - 4, h, {
      align: "right",
      valign: "center",
    });
    doc.y = top + h + 8;

    doc.font(fonts.regular).fontSize(8.5);
    doc.text(`Кількість: ${formatUaQty(totalQty)}`, L, doc.y);
    doc.y += 11;
    doc.text(
      `Всього найменувань ${namesCount}, на суму ${formatUaMoney(totalUah)} грн`,
      L,
      doc.y,
      { width: W },
    );
  }

  private drawWaybillSignatures(doc: PdfDoc, fonts: Fonts) {
    this.ensureSpace(doc, 80);
    doc.y += 20;
    const y = doc.y;
    const mid = L + W / 2;
    const leftW = W / 2 - 16;
    const rightX = mid + 16;

    doc.font(fonts.regular).fontSize(9);
    doc.text("Від постачальника*", L, y, { width: leftW });
    doc.text("Отримав(ла)", rightX, y, { width: leftW });

    doc
      .moveTo(L, y + 26)
      .lineTo(L + leftW - 10, y + 26)
      .stroke();
    doc
      .moveTo(rightX, y + 26)
      .lineTo(R, y + 26)
      .stroke();

    doc.font(fonts.regular).fontSize(7);
    doc.text(
      "* Відповідальний за здійснення господарської операції і правильність її оформлення",
      L,
      y + 32,
      { width: leftW },
    );

    doc.font(fonts.regular).fontSize(9);
    doc.text("За довіреністю", rightX, y + 34, { width: leftW });
    doc.text("№ __________ від __________", rightX, y + 48, { width: leftW });
    doc.y = y + 68;
  }
}
