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
  | "CONTACT_MISMATCH"
  | "CONTACT_NOT_FOUND";

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
  /** All orders with debt belonging to the resolved contact — for the manual picker. */
  contactOrders: OneCMatchedOrder[];
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
      where: {
        OR: [
          { oneCImportKey: { in: importKeys } },
          ...importKeys.map((k) => ({ oneCImportKey: { startsWith: `${k}#` } })),
        ],
      },
      select: { oneCImportKey: true, orderId: true },
    });
    const existingKeys = new Set(
      existing
        .map((p) => p.oneCImportKey)
        .filter(Boolean)
        .map((k) => (k!.includes("#") ? k!.slice(0, k!.indexOf("#")) : k!)),
    );

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

    // Pre-load orders with debt for each resolved contact
    const contactIds = [...new Set(contacts.map((c) => c.id))];
    const contactOrdersMap = new Map<string, OneCMatchedOrder[]>();
    if (contactIds.length > 0) {
      const ordersWithDebt = await this.prisma.order.findMany({
        where: {
          OR: [
            { contactId: { in: contactIds } },
            { clientId: { in: contactIds } },
          ],
          debtAmount: { gt: 0 },
        },
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
            select: { id: true, firstName: true, lastName: true, documentDisplayName: true, externalCode: true },
          },
          client: {
            select: { id: true, firstName: true, lastName: true, documentDisplayName: true, externalCode: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      for (const o of ordersWithDebt) {
        const cId = o.contactId ?? o.clientId;
        if (!cId) continue;
        const c = o.contact ?? o.client;
        const mapped: OneCMatchedOrder = {
          orderId: o.id,
          orderNumber: o.orderNumber,
          invoiceNumber: o.invoiceNumber,
          waybillNumber: o.waybillNumber,
          debtAmount: o.debtAmount,
          currency: o.currency,
          contactId: cId,
          companyId: o.companyId,
          contactExternalCode: c?.externalCode ?? null,
          contactLabel: contactLabel(c),
        };
        const list = contactOrdersMap.get(cId) ?? [];
        list.push(mapped);
        contactOrdersMap.set(cId, list);
      }
    }

    const results: OneCMatchResult[] = [];
    // Track which orders have already been assigned to avoid double-matching
    const usedOrderIds = new Set<string>();
    for (const row of rows) {
      const result = await this.matchOne(row, existingKeys, contactByNormCode, contactOrdersMap, usedOrderIds);
      if (result.order) usedOrderIds.add(result.order.orderId);
      results.push(result);
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
    contactOrdersMap: Map<string, OneCMatchedOrder[]>,
    usedOrderIds: Set<string>,
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

    const contactOrders = contact ? contactOrdersMap.get(contact.id) ?? [] : [];

    if (existingKeys.has(row.importKey)) {
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: "ALREADY_IMPORTED",
        matchSource: null,
        matchedRef: null,
        order: null,
        candidateOrders: [],
        contactOrders: [],
        contactByCode,
        warnings,
        amountDebtDelta: null,
      };
    }

    // Contact not found in CRM — cannot match orders
    if (row.enterpriseCode && !contact) {
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: "CONTACT_NOT_FOUND",
        matchSource: null,
        matchedRef: null,
        order: null,
        candidateOrders: [],
        contactOrders: [],
        contactByCode: null,
        warnings: [`Контакт з кодом 1С «${row.enterpriseCode}» (${row.enterpriseName}) не знайдено в CRM`],
        amountDebtDelta: null,
      };
    }

    // Try to match by invoice/waybill refs from purpose text, but only accept if the order belongs to our contact
    const refs = extractOneCDocumentRefs(row.purpose || null);
    let matchSource: OneCMatchResult["matchSource"] = null;
    let matchedRef: string | null = null;
    let order: OneCMatchedOrder | null = null;

    if (contact) {
      const fromPurpose = await this.resolveFromRefs(refs);
      if (fromPurpose.order && this.orderBelongsToContact(fromPurpose.order, contact.id)) {
        order = fromPurpose.order;
        matchedRef = fromPurpose.matchedRef;
        matchSource =
          fromPurpose.matchType === "invoice"
            ? "purpose_invoice"
            : fromPurpose.matchType === "waybill"
              ? "purpose_waybill"
              : "purpose_unlabeled";
      }

      // Fallback: try document number
      if (!order && row.documentNumber) {
        const byDoc = await this.resolveByDocumentNumber(row.documentNumber);
        if (byDoc.order && this.orderBelongsToContact(byDoc.order, contact.id)) {
          order = byDoc.order;
          matchedRef = row.documentNumber;
          matchSource = "document_number";
        }
      }

      if (!order) {
        const available = contactOrders.filter((o) => !usedOrderIds.has(o.orderId));

        // Try exact amount match among available orders
        const amountMatch = available.find(
          (o) => Math.abs(o.debtAmount - row.amountLv) <= DEBT_TOLERANCE,
        );
        if (amountMatch) {
          order = amountMatch;
          matchSource = null;
          warnings.push("Автоматично підібрано за сумою боргу");
        } else if (available.length === 1) {
          order = available[0]!;
          matchSource = null;
          warnings.push("Єдине доступне замовлення клієнта з боргом");
        }
      }
    }

    if (!order) {
      const totalDebt = contactOrders.reduce((sum, o) => sum + o.debtAmount, 0);
      const canAutoDistribute = contactOrders.length > 1 && totalDebt + DEBT_TOLERANCE >= row.amountLv;
      return {
        rowIndex: row.rowIndex,
        importKey: row.importKey,
        status: canAutoDistribute ? "MATCHED" : "UNMATCHED",
        matchSource: null,
        matchedRef: null,
        order: null,
        candidateOrders: contactOrders,
        contactOrders,
        contactByCode,
        warnings:
          contactOrders.length === 0
            ? [...warnings, "У клієнта немає замовлень з боргом"]
            : canAutoDistribute
              ? [...warnings, "Буде автоматичний розподіл платежу по кількох замовленнях клієнта"]
              : warnings,
        amountDebtDelta: null,
      };
    }

    const delta = Math.abs(row.amountLv - order.debtAmount);
    if (delta > DEBT_TOLERANCE) {
      warnings.push(
        `Сума ${row.amountLv} відрізняється від боргу замовлення ${order.debtAmount} на ${delta.toFixed(2)}`,
      );
    }

    return {
      rowIndex: row.rowIndex,
      importKey: row.importKey,
      status: "MATCHED",
      matchSource,
      matchedRef,
      order,
      candidateOrders: [],
      contactOrders,
      contactByCode,
      warnings,
      amountDebtDelta: Number((row.amountLv - order.debtAmount).toFixed(2)),
    };
  }

  private orderBelongsToContact(order: OneCMatchedOrder, contactId: string): boolean {
    return order.contactId === contactId;
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
  }> {
    const resolved = await resolveUniqueDocumentOrder(this.prisma, refs);
    if (resolved.ambiguous || !resolved.orderId) {
      return { order: null, matchType: null, matchedRef: null };
    }
    const order = await this.loadOrder(resolved.orderId);
    return {
      order,
      matchType: resolved.matchType,
      matchedRef: resolved.matchedRef,
    };
  }

  private async resolveByDocumentNumber(docNumber: string): Promise<{
    order: OneCMatchedOrder | null;
  }> {
    const token = docNumber.trim();
    if (!token) return { order: null };

    for (const field of ["invoiceNumber", "waybillNumber", "orderNumber"] as const) {
      const rows = await this.prisma.order.findMany({
        where: { [field]: token },
        select: { id: true },
        take: 2,
      });
      if (rows.length === 1) {
        const order = await this.loadOrder(rows[0]!.id);
        return { order };
      }
    }
    return { order: null };
  }
}
