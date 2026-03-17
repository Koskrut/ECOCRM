import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

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
  bankAccount: {
    select: {
      id: true,
      name: true,
      documentRequisites: true,
    },
  },
  items: {
    include: {
      product: { select: { id: true, sku: true, name: true } },
    },
  },
} as const;

export type DocumentRequisites = {
  legalName?: string;
  taxId?: string;
  address?: string;
  bankDetails?: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

@Injectable()
export class OrdersDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private sellerLines(requisites: DocumentRequisites | null): string[] {
    if (!requisites) return ["—"];
    const lines: string[] = [];
    if (requisites.legalName) lines.push(requisites.legalName);
    if (requisites.taxId) lines.push(`ІПН: ${requisites.taxId}`);
    if (requisites.address) lines.push(requisites.address);
    if (requisites.bankDetails) lines.push(requisites.bankDetails);
    return lines.length ? lines : ["—"];
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

  async buildInvoicePdf(orderId: string, actor?: AuthUser): Promise<Buffer> {
    const order = await this.getOrderForDocument(orderId, actor);
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      doc.on("end", () => resolve());
      doc.on("error", reject);
      this.drawInvoice(doc, order);
      doc.end();
    });
    return Buffer.concat(chunks);
  }

  async buildWaybillPdf(orderId: string, actor?: AuthUser): Promise<Buffer> {
    const order = await this.getOrderForDocument(orderId, actor);
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      doc.on("end", () => resolve());
      doc.on("error", reject);
      this.drawWaybill(doc, order);
      doc.end();
    });
    return Buffer.concat(chunks);
  }

  private drawInvoice(
    doc: PdfDoc,
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DOCUMENTS_INCLUDE }>,
  ) {
    const requisites = (order.bankAccount?.documentRequisites as DocumentRequisites | null) ?? null;
    const seller = this.sellerLines(requisites);
    const buyer = this.buyerName(order.contact);

    doc.fontSize(14).text("Рахунок", { align: "center" }).moveDown(0.5);
    doc.fontSize(10);
    doc.text("Продавець:", 50, doc.y);
    doc.y += 4;
    seller.forEach((line) => {
      doc.text(line, 55, doc.y);
      doc.y += 14;
    });
    doc.moveDown(0.5);
    doc.text("Покупець: " + buyer, 50, doc.y);
    doc.y += 20;

    const orderDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("uk-UA")
      : "—";
    doc.text(`Номер замовлення: ${order.orderNumber}`, 50, doc.y);
    doc.y += 14;
    doc.text(`Дата: ${orderDate}`, 50, doc.y);
    doc.y += 14;
    const invNum = order.invoiceNumber ?? "—";
    const invDate = order.invoiceDate
      ? new Date(order.invoiceDate).toLocaleDateString("uk-UA")
      : "—";
    doc.text(`Номер рахунку: ${invNum}`, 50, doc.y);
    doc.y += 14;
    doc.text(`Дата рахунку: ${invDate}`, 50, doc.y);
    doc.y += 24;

    const tableTop = doc.y;
    doc.font("Helvetica-Bold");
    doc.text("№", 50, tableTop);
    doc.text("Найменування", 70, tableTop);
    doc.text("Кількість", 320, tableTop);
    doc.text("Ціна", 380, tableTop);
    doc.text("Сума", 440, tableTop);
    doc.y += 18;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 8;
    doc.font("Helvetica");

    order.items.forEach((item, idx) => {
      const name = item.product?.name ?? item.productNameSnapshot ?? "—";
      const qty = String(item.qty);
      const price = item.price.toFixed(2);
      const sum = item.lineTotal.toFixed(2);
      doc.text(String(idx + 1), 50, doc.y);
      doc.text(name.substring(0, 45), 70, doc.y);
      doc.text(qty, 320, doc.y);
      doc.text(price, 380, doc.y);
      doc.text(sum, 440, doc.y);
      doc.y += 18;
    });

    doc.y += 8;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 14;
    doc.font("Helvetica-Bold");
    const totalStr = `Разом: ${order.totalAmount.toFixed(2)} ${order.currency}`;
    doc.text(totalStr, 380, doc.y);
  }

  private drawWaybill(
    doc: PdfDoc,
    order: Prisma.OrderGetPayload<{ include: typeof ORDER_DOCUMENTS_INCLUDE }>,
  ) {
    const requisites = (order.bankAccount?.documentRequisites as DocumentRequisites | null) ?? null;
    const seller = this.sellerLines(requisites);
    const buyer = this.buyerName(order.contact);

    doc.fontSize(14).text("Расходная накладная (РН)", { align: "center" }).moveDown(0.5);
    doc.fontSize(10);
    doc.text("Відправник:", 50, doc.y);
    doc.y += 4;
    seller.forEach((line) => {
      doc.text(line, 55, doc.y);
      doc.y += 14;
    });
    doc.moveDown(0.5);
    doc.text("Отримувач: " + buyer, 50, doc.y);
    doc.y += 20;

    const orderDate = order.createdAt
      ? new Date(order.createdAt).toLocaleDateString("uk-UA")
      : "—";
    const waybillNum = order.waybillNumber ?? "—";
    const waybillDate = order.waybillDate
      ? new Date(order.waybillDate).toLocaleDateString("uk-UA")
      : "—";

    doc.text(`Номер замовлення: ${order.orderNumber}`, 50, doc.y);
    doc.y += 14;
    doc.text(`Дата замовлення: ${orderDate}`, 50, doc.y);
    doc.y += 14;
    doc.text(`Номер РН: ${waybillNum}`, 50, doc.y);
    doc.y += 14;
    doc.text(`Дата РН: ${waybillDate}`, 50, doc.y);
    doc.y += 24;

    const tableTop = doc.y;
    doc.font("Helvetica-Bold");
    doc.text("№", 50, tableTop);
    doc.text("Найменування", 70, tableTop);
    doc.text("Кількість", 320, tableTop);
    doc.text("Ціна", 380, tableTop);
    doc.text("Сума", 440, tableTop);
    doc.y += 18;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 8;
    doc.font("Helvetica");

    order.items.forEach((item, idx) => {
      const name = item.product?.name ?? item.productNameSnapshot ?? "—";
      const qty = String(item.qty);
      const price = item.price.toFixed(2);
      const sum = item.lineTotal.toFixed(2);
      doc.text(String(idx + 1), 50, doc.y);
      doc.text(name.substring(0, 45), 70, doc.y);
      doc.text(qty, 320, doc.y);
      doc.text(price, 380, doc.y);
      doc.text(sum, 440, doc.y);
      doc.y += 18;
    });

    doc.y += 8;
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.y += 14;
    doc.font("Helvetica-Bold");
    const totalStr = `Разом: ${order.totalAmount.toFixed(2)} ${order.currency}`;
    doc.text(totalStr, 380, doc.y);
  }
}
