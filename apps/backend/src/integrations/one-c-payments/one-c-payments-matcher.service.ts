import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { resolveUniqueDocumentOrder } from "../../bank/document-match.utils";
import { extractOneCDocumentRefs } from "./one-c-document-refs";
import { normalizeOneCCode, type OneCPaymentExcelRow } from "./one-c-payments-excel.parser";

export type OneCMatchStatus =
  | "MATCHED"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "ALREADY_IMPORTED"
  | "CONTACT_MISMATCH";

export type OneCMatchedOrder = {
  orderId: string;
  orderNumber: string;
  invoiceNumber: string | null;
  waybillNumber: string | null;
  debtAmount: number;
  currency: string;
  contactId: string | null;
  companyId: string | null;
  contactExternalCode: string | null;
  contactLabel: string | null;
};

export type OneCMatchResult = {
  rowIndex: number;
  importKey: string;
  status: OneCMatchStatus;
  matchSource: "purpose_invoice" | "purpose_waybill" | "purpose_unlabeled" | "document_number" | "manual" | null;
  matchedRef: string | null;
  order: OneCMatchedOrder | null;
  candidateOrders: OneCMatchedOrder[];
  contactByCode: { contactId: string; label: string; externalCode: string } | null;
  warnings: string[];
  amountDebtDelta: number | null;
};

const DEBT_TOLERANCE = 1;

function contactLabel(c: {
  firstName: string;
  lastName: string;
  documentDisplayName?: string | null;
} | null): string | null {
  if (!c) return null;
  if (c.documentDisplayName?.trim()) return c.documentDisplayName.trim();
  return [c.lastName, c.firstName].filter(Boolean).join(" ").trim() || null;
}

@Injectable()
export class OneCPaymentsMatcherService {
  constructor(private readonly prisma: PrismaService) {}

  async matchRows(rows: OneCPaymentExcelRow[]): Promise<OneCMatchResult[]> {
    const importKeys = rows.map((r) => r.importKey);
    const existing = await this.prisma.payment.findMany({
      where: { oneCImportKey: { in: importKeys } },
      select: { oneCImportKey: true, orderId: true },
    });
    const existingKeys = new Set(existing.map((p) => p.oneCImportKey).filter(Boolean) as string[]);

    const enterpriseCodes = [
      ...new Set(rows.map((r) => r.enterpriseCode).filter(Boolean)),
    ];
    const contacts = enterpriseCodes.length
      ? await this.prisma.contact.findMany({
          where: {
            OR: enterpriseCodes.flatMap((code) => [
              { externalCode: code },
              { externalCode: code.padStart(9, "0") },
            ]),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentDisplayName: true,
            externalCode: true,
          },
        })
      : [];

    const contactByNormCode = new Map<string, (typeof contacts)[0]>();
    for (const c of contacts) {
      const norm = normalizeOneCCode(c.externalCode);
      if (norm && !contactByNormCode.has(norm)) contactByNormCode.set(norm, c);
    }

    const results: OneCMatchResult[] = [];
    for (const row of rows) {
      results.push(await this.matchOne(row, existingKeys, contactByNormCode));
    }
    return results;
  }

  private async matchOne(
    row: OneCPaymentExcelRow,
    existingKeys: Set<string>,
    contactByNormCode: Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        documentDisplayName: string | null;
        externalCode: string | null;
      }
    >,
  ): Promise<OneCMatchResult> {
    const warnings: string[] = [];
    const contact = row.enterpriseCode ? contactByNormCode.get(row.enterpriseCode) ?? null : null;
    const contactByCode = contact
      ? {
          contactId: contact.id,
          label: contactLabel(contact) ?? row.enterpriseName,
          externalCode: normalizeOneCCode(contact.externalCode),
        }
      : null;

    if (row.enterpriseCode && !contact) {
      warnings.push(`Contact with externalCode=${row.enterpriseCode} not found`);
    }

    if (existingKeys.has(row.importKey)) {
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: "ALREADY_IMPORTED",
        matchSource: null,
        matchedRef: null,
        order: null,
        candidateOrders: [],
        contactByCode,
        warnings,
        amountDebtDelta: null,
      };
    }

    const refs = extractOneCDocumentRefs(row.purpose || null);
    const fromPurpose = await this.resolveFromRefs(refs);
    let matchSource: OneCMatchResult["matchSource"] = null;
    let matchedRef: string | null = null;
    let order: OneCMatchedOrder | null = null;
    let ambiguous = false;
    const candidates: OneCMatchedOrder[] = [];

    if (fromPurpose.ambiguous) {
      ambiguous = true;
    } else if (fromPurpose.order) {
      order = fromPurpose.order;
      matchedRef = fromPurpose.matchedRef;
      matchSource =
        fromPurpose.matchType === "invoice"
          ? "purpose_invoice"
          : fromPurpose.matchType === "waybill"
            ? "purpose_waybill"
            : "purpose_unlabeled";
    }

    if (!order && !ambiguous && row.documentNumber) {
      const byDoc = await this.resolveByDocumentNumber(row.documentNumber);
      if (byDoc.ambiguous) {
        ambiguous = true;
        candidates.push(...byDoc.candidates);
      } else if (byDoc.order) {
        order = byDoc.order;
        matchedRef = row.documentNumber;
        matchSource = "document_number";
      }
    }

    if (ambiguous && candidates.length === 0 && fromPurpose.candidates.length) {
      candidates.push(...fromPurpose.candidates);
    }

    if (ambiguous) {
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: "AMBIGUOUS",
        matchSource: null,
        matchedRef,
        order: null,
        candidateOrders: candidates,
        contactByCode,
        warnings,
        amountDebtDelta: null,
      };
    }

    if (!order) {
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: "UNMATCHED",
        matchSource: null,
        matchedRef: null,
        order: null,
        candidateOrders: [],
        contactByCode,
        warnings,
        amountDebtDelta: null,
      };
    }

    let status: OneCMatchStatus = "MATCHED";
    if (contact) {
      if (order.contactId && order.contactId !== contact.id) {
        status = "CONTACT_MISMATCH";
        warnings.push("Matched order belongs to a different contact than enterprise code");
      } else {
        const orderCode = normalizeOneCCode(order.contactExternalCode);
        if (orderCode && orderCode !== row.enterpriseCode) {
          status = "CONTACT_MISMATCH";
          warnings.push(
            `Order contact externalCode=${orderCode} ≠ enterprise ${row.enterpriseCode}`,
          );
        } else if (!orderCode) {
          warnings.push("Order contact has no externalCode; enterprise code not verified");
        }
      }
    }

    const delta = Math.abs(row.amountLv - order.debtAmount);
    if (delta > DEBT_TOLERANCE) {
      warnings.push(
        `Amount ${row.amountLv} differs from order debt ${order.debtAmount} by ${delta.toFixed(2)}`,
      );
    }

    return {
      rowIndex: row.rowIndex,
      importKey: row.importKey,
      status,
      matchSource,
      matchedRef,
      order,
      candidateOrders: [],
      contactByCode,
      warnings,
      amountDebtDelta: Number((row.amountLv - order.debtAmount).toFixed(2)),
    };
  }

  private async loadOrder(orderId: string): Promise<OneCMatchedOrder | null> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        invoiceNumber: true,
        waybillNumber: true,
        debtAmount: true,
        currency: true,
        contactId: true,
        companyId: true,
        clientId: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentDisplayName: true,
            externalCode: true,
          },
        },
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            documentDisplayName: true,
            externalCode: true,
          },
        },
      },
    });
    if (!o) return null;
    const c = o.contact ?? o.client;
    return {
      orderId: o.id,
      orderNumber: o.orderNumber,
      invoiceNumber: o.invoiceNumber,
      waybillNumber: o.waybillNumber,
      debtAmount: o.debtAmount,
      currency: o.currency,
      contactId: o.contactId ?? o.clientId,
      companyId: o.companyId,
      contactExternalCode: c?.externalCode ?? null,
      contactLabel: contactLabel(c),
    };
  }

  private async resolveFromRefs(refs: {
    invoices: string[];
    waybills: string[];
    unlabeled: string[];
  }): Promise<{
    order: OneCMatchedOrder | null;
    matchType: "invoice" | "waybill" | null;
    matchedRef: string | null;
    ambiguous: boolean;
    candidates: OneCMatchedOrder[];
  }> {
    const resolved = await resolveUniqueDocumentOrder(this.prisma, refs);
    if (resolved.ambiguous) {
      return { order: null, matchType: null, matchedRef: null, ambiguous: true, candidates: [] };
    }
    if (!resolved.orderId) {
      return { order: null, matchType: null, matchedRef: null, ambiguous: false, candidates: [] };
    }
    const order = await this.loadOrder(resolved.orderId);
    return {
      order,
      matchType: resolved.matchType,
      matchedRef: resolved.matchedRef,
      ambiguous: false,
      candidates: [],
    };
  }

  private async resolveByDocumentNumber(docNumber: string): Promise<{
    order: OneCMatchedOrder | null;
    ambiguous: boolean;
    candidates: OneCMatchedOrder[];
  }> {
    const token = docNumber.trim();
    if (!token) return { order: null, ambiguous: false, candidates: [] };

    const byInvoice = await this.prisma.order.findMany({
      where: { invoiceNumber: token },
      select: { id: true },
      take: 5,
    });
    if (byInvoice.length === 1) {
      const order = await this.loadOrder(byInvoice[0]!.id);
      return { order, ambiguous: false, candidates: [] };
    }
    if (byInvoice.length > 1) {
      const candidates = (
        await Promise.all(byInvoice.map((r) => this.loadOrder(r.id)))
      ).filter(Boolean) as OneCMatchedOrder[];
      return { order: null, ambiguous: true, candidates };
    }

    const byWaybill = await this.prisma.order.findMany({
      where: { waybillNumber: token },
      select: { id: true },
      take: 5,
    });
    if (byWaybill.length === 1) {
      const order = await this.loadOrder(byWaybill[0]!.id);
      return { order, ambiguous: false, candidates: [] };
    }
    if (byWaybill.length > 1) {
      const candidates = (
        await Promise.all(byWaybill.map((r) => this.loadOrder(r.id)))
      ).filter(Boolean) as OneCMatchedOrder[];
      return { order: null, ambiguous: true, candidates };
    }

    const byOrderNumber = await this.prisma.order.findMany({
      where: { orderNumber: token },
      select: { id: true },
      take: 5,
    });
    if (byOrderNumber.length === 1) {
      const order = await this.loadOrder(byOrderNumber[0]!.id);
      return { order, ambiguous: false, candidates: [] };
    }
    if (byOrderNumber.length > 1) {
      const candidates = (
        await Promise.all(byOrderNumber.map((r) => this.loadOrder(r.id)))
      ).filter(Boolean) as OneCMatchedOrder[];
      return { order: null, ambiguous: true, candidates };
    }

    return { order: null, ambiguous: false, candidates: [] };
  }
}
