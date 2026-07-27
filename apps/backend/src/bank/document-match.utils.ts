import type { PrismaService } from "../prisma/prisma.service";
import type { DocumentRefs } from "./match-engine.utils";

export type ResolvedDocumentMatch = {
  orderId: string | null;
  matchType: "invoice" | "waybill" | null;
  matchedRef: string | null;
  invoiceNumber: string | null;
  waybillNumber: string | null;
  ambiguous: boolean;
};

type OrderDocRow = {
  id: string;
  invoiceNumber: string | null;
  waybillNumber: string | null;
};

function singleOrder(rows: OrderDocRow[]): OrderDocRow | null {
  if (rows.length === 0) return null;
  const ids = new Set(rows.map((r) => r.id));
  if (ids.size !== 1) return null;
  return rows[0]!;
}

/**
 * Resolve exactly one order by 1C invoice / waybill refs from payment purpose.
 * Priority: labeled invoice > labeled waybill > unlabeled token (invoice field, then waybill).
 */
export async function resolveUniqueDocumentOrder(
  prisma: Pick<PrismaService, "order">,
  refs: DocumentRefs,
): Promise<ResolvedDocumentMatch> {
  const empty: ResolvedDocumentMatch = {
    orderId: null,
    matchType: null,
    matchedRef: null,
    invoiceNumber: null,
    waybillNumber: null,
    ambiguous: false,
  };

  if (refs.invoices.length > 0) {
    const rows = await prisma.order.findMany({
      where: { invoiceNumber: { in: refs.invoices } },
      select: { id: true, invoiceNumber: true, waybillNumber: true },
    });
    const ids = new Set(rows.map((r) => r.id));
    if (ids.size > 1) return { ...empty, ambiguous: true };
    const one = singleOrder(rows);
    if (one) {
      const ref = refs.invoices.find((r) => r === one.invoiceNumber) ?? one.invoiceNumber;
      return {
        orderId: one.id,
        matchType: "invoice",
        matchedRef: ref,
        invoiceNumber: one.invoiceNumber,
        waybillNumber: one.waybillNumber,
        ambiguous: false,
      };
    }
  }

  if (refs.waybills.length > 0) {
    const rows = await prisma.order.findMany({
      where: { waybillNumber: { in: refs.waybills } },
      select: { id: true, invoiceNumber: true, waybillNumber: true },
    });
    const ids = new Set(rows.map((r) => r.id));
    if (ids.size > 1) return { ...empty, ambiguous: true };
    const one = singleOrder(rows);
    if (one) {
      const ref = refs.waybills.find((r) => r === one.waybillNumber) ?? one.waybillNumber;
      return {
        orderId: one.id,
        matchType: "waybill",
        matchedRef: ref,
        invoiceNumber: one.invoiceNumber,
        waybillNumber: one.waybillNumber,
        ambiguous: false,
      };
    }
  }

  if (refs.unlabeled.length > 0) {
    const matched = new Map<string, OrderDocRow>();
    for (const token of refs.unlabeled) {
      const byInvoice = await prisma.order.findMany({
        where: { invoiceNumber: token },
        select: { id: true, invoiceNumber: true, waybillNumber: true },
      });
      if (byInvoice.length > 1) return { ...empty, ambiguous: true };
      if (byInvoice.length === 1) {
        matched.set(byInvoice[0]!.id, byInvoice[0]!);
        continue;
      }
      const byWaybill = await prisma.order.findMany({
        where: { waybillNumber: token },
        select: { id: true, invoiceNumber: true, waybillNumber: true },
      });
      if (byWaybill.length > 1) return { ...empty, ambiguous: true };
      if (byWaybill.length === 1) matched.set(byWaybill[0]!.id, byWaybill[0]!);
    }
    if (matched.size > 1) return { ...empty, ambiguous: true };
    if (matched.size === 1) {
      const one = [...matched.values()][0]!;
      const token = refs.unlabeled.find(
        (t) => t === one.invoiceNumber || t === one.waybillNumber,
      );
      const matchType =
        token === one.invoiceNumber || one.invoiceNumber != null ? "invoice" : "waybill";
      return {
        orderId: one.id,
        matchType: matchType as "invoice" | "waybill",
        matchedRef: token ?? one.invoiceNumber ?? one.waybillNumber,
        invoiceNumber: one.invoiceNumber,
        waybillNumber: one.waybillNumber,
        ambiguous: false,
      };
    }
  }

  return empty;
}

/** True when orderNumber resolves to a different order than document match. */
export function documentConflictsWithOrderNumber(
  orderNumberOrderId: string | null,
  documentOrderId: string | null,
): boolean {
  if (!orderNumberOrderId || !documentOrderId) return false;
  return orderNumberOrderId !== documentOrderId;
}
