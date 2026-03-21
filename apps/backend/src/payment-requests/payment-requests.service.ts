import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, UserRole, type PaymentRequest } from "@prisma/client";
import { randomBytes } from "crypto";
import type { AuthUser } from "../auth/auth.types";
import type { DocumentRequisites } from "../orders/orders-documents.service";
import { PrismaService } from "../prisma/prisma.service";
import { buildNbuPaymentDeeplink } from "./nbu-qr";
import {
  effectivePaymentRequestStatus,
  toPaymentRequestPublicDto,
  type PaymentRequestPublicDto,
} from "./payment-request-public.mapper";
import type { CreatePaymentRequestDto } from "./dto/create-payment-request.dto";

function assertOrderAccess(order: { ownerId: string }, actor?: AuthUser): void {
  if (actor?.role === UserRole.MANAGER && order.ownerId !== actor.id) {
    throw new ForbiddenException("You can only access orders assigned to you");
  }
}

function parseDocumentRequisites(json: unknown): DocumentRequisites | null {
  if (!json || typeof json !== "object") return null;
  return json as DocumentRequisites;
}

function normalizeIban(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s/g, "");
}

function digitsFromField(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\D/g, "");
}

function collectJsonStrings(obj: unknown, acc: string[]): void {
  if (obj == null) return;
  if (typeof obj === "string") {
    acc.push(obj);
    return;
  }
  if (typeof obj === "number" || typeof obj === "bigint") {
    acc.push(String(obj));
    return;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) collectJsonStrings(x, acc);
    return;
  }
  if (typeof obj === "object") {
    for (const v of Object.values(obj as Record<string, unknown>)) collectJsonStrings(v, acc);
  }
}

/** Шукає 8- або 10-значний код у довільних рядках JSON (інші ключі/формати з 1С тощо). */
function findReceiverCodeInStrings(strings: string[]): string | null {
  for (const s of strings) {
    const compact = s.replace(/\D/g, "");
    if (compact.length === 8 || compact.length === 10) return compact;
    const m10 = s.match(/\d{10}/);
    if (m10) return m10[0];
    const m8 = s.match(/\d{8}/);
    if (m8) return m8[0];
  }
  return null;
}

type CompanyTax = { edrpou: string | null; taxId: string | null };

/** ЄДРПОУ (8) або РНОКПП/ІПН (10) для NBU QR. */
function resolveReceiverCode(params: {
  manual: string | undefined;
  requisites: DocumentRequisites | null;
  documentRequisitesJson: unknown;
  orderCompany: CompanyTax | null;
  clientCompany: CompanyTax | null;
}): string {
  const m = params.manual?.trim();
  if (m) {
    const d = digitsFromField(m);
    if (d.length === 8 || d.length === 10) return d;
    throw new BadRequestException("receiverCode must be exactly 8 (ЄДРПОУ) or 10 (ІПН) digits.");
  }

  const tries: string[] = [
    digitsFromField(params.requisites?.edrpou),
    digitsFromField(params.requisites?.taxId),
    digitsFromField(params.orderCompany?.edrpou),
    digitsFromField(params.orderCompany?.taxId),
    digitsFromField(params.clientCompany?.edrpou),
    digitsFromField(params.clientCompany?.taxId),
  ];
  for (const code of tries) {
    if (code.length === 8 || code.length === 10) return code;
  }

  const jsonStrings: string[] = [];
  collectJsonStrings(params.documentRequisitesJson, jsonStrings);
  const fromJson = findReceiverCodeInStrings(jsonStrings);
  if (fromJson) return fromJson;

  throw new BadRequestException(
    "Fill ЄДРПОУ (8) or ІПН (10) in Settings → FOP account requisites, on the order company, or enter the code manually in the form — required for the NBU payment link.",
  );
}

export type PaymentRequestListItemDto = {
  id: string;
  orderId: string;
  status: string;
  effectiveStatus: string;
  amount: number;
  currency: string;
  purpose: string;
  expiresAt: string;
  recipientName: string;
  iban: string;
  edrpou: string | null;
  publicToken: string;
  nbuDeeplink: string;
  createdAt: string;
  paidAt: string | null;
};

@Injectable()
export class PaymentRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByOrderId(orderId: string, actor?: AuthUser): Promise<PaymentRequestListItemDto[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    assertOrderAccess(order, actor);

    const rows = await this.prisma.paymentRequest.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    const now = new Date();
    return rows.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      status: r.status,
      effectiveStatus: effectivePaymentRequestStatus(r, now),
      amount: Number(r.amount),
      currency: r.currency,
      purpose: r.purpose,
      expiresAt: r.expiresAt.toISOString(),
      recipientName: r.recipientName,
      iban: r.iban,
      edrpou: r.edrpou,
      publicToken: r.publicToken,
      nbuDeeplink: r.nbuDeeplink,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt?.toISOString() ?? null,
    }));
  }

  async create(orderId: string, dto: CreatePaymentRequestDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        bankAccount: true,
        company: { select: { edrpou: true, taxId: true } },
        client: { select: { company: { select: { edrpou: true, taxId: true } } } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    assertOrderAccess(order, actor);

    const expiresAt = new Date(dto.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("Invalid expiresAt");
    }
    if (expiresAt <= new Date()) {
      throw new BadRequestException("expiresAt must be in the future");
    }

    if (!order.bankAccount) {
      throw new BadRequestException("Order has no bank account; set FOP account on the order first.");
    }

    const reqJson = order.bankAccount.documentRequisites;
    const requisites = parseDocumentRequisites(reqJson);
    const iban = normalizeIban(requisites?.iban || order.bankAccount.iban);
    if (!iban) {
      throw new BadRequestException("Bank account has no IBAN for payment link.");
    }

    const recipientName = (requisites?.legalName ?? order.bankAccount.name).trim().slice(0, 70);
    if (!recipientName) {
      throw new BadRequestException("Recipient name is missing in bank account / requisites.");
    }

    const receiverCode = resolveReceiverCode({
      manual: dto.receiverCode,
      requisites,
      documentRequisitesJson: reqJson,
      orderCompany: order.company ?? null,
      clientCompany: order.client?.company ?? null,
    });
    const currency = (order.currency || "UAH").trim().toUpperCase().slice(0, 3);
    if (currency.length !== 3) {
      throw new BadRequestException("Invalid order currency");
    }

    const nbuDeeplink = buildNbuPaymentDeeplink({
      recipientName,
      iban,
      receiverCode,
      currency,
      amount: dto.amount,
      purpose: dto.purpose,
      displayText: dto.displayText,
    });

    const publicToken = randomBytes(32).toString("base64url");

    const row = await this.prisma.paymentRequest.create({
      data: {
        orderId,
        status: "PENDING",
        amount: new Prisma.Decimal(dto.amount.toFixed(2)),
        currency,
        purpose: dto.purpose.trim(),
        expiresAt,
        recipientName,
        iban,
        edrpou: receiverCode,
        mfo: requisites?.mfo?.trim() || null,
        bankName: null,
        publicToken,
        nbuDeeplink,
        createdByUserId: actor?.id ?? null,
      },
    });

    return this.toInternalCreateResult(row);
  }

  private toInternalCreateResult(row: PaymentRequest) {
    const now = new Date();
    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      effectiveStatus: effectivePaymentRequestStatus(row, now),
      amount: Number(row.amount),
      currency: row.currency,
      purpose: row.purpose,
      expiresAt: row.expiresAt.toISOString(),
      recipientName: row.recipientName,
      iban: row.iban,
      edrpou: row.edrpou,
      publicToken: row.publicToken,
      nbuDeeplink: row.nbuDeeplink,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async cancel(id: string, actor?: AuthUser) {
    const row = await this.prisma.paymentRequest.findUnique({
      where: { id },
      include: { order: { select: { ownerId: true } } },
    });
    if (!row) throw new NotFoundException("Payment request not found");
    assertOrderAccess(row.order, actor);

    if (row.status !== "PENDING") {
      throw new BadRequestException("Only pending payment links can be canceled");
    }
    if (row.expiresAt <= new Date()) {
      throw new BadRequestException("This link is already expired");
    }

    const updated = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: "CANCELED" },
    });
    return { id: updated.id, status: updated.status };
  }

  async markPaid(id: string, actor?: AuthUser) {
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admin can mark payment request as paid");
    }
    const row = await this.prisma.paymentRequest.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Payment request not found");
    if (row.status === "CANCELED") {
      throw new BadRequestException("Cannot mark canceled request as paid");
    }
    const updated = await this.prisma.paymentRequest.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() },
    });
    return { id: updated.id, status: updated.status };
  }

  async getPublicByToken(token: string): Promise<PaymentRequestPublicDto> {
    const row = await this.prisma.paymentRequest.findUnique({
      where: { publicToken: token },
    });
    if (!row) {
      throw new NotFoundException("Payment link not found");
    }
    const QR = await import("qrcode");
    const qrPngDataUrl = await QR.toDataURL(row.nbuDeeplink, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
    });
    return toPaymentRequestPublicDto(row, qrPngDataUrl);
  }
}
