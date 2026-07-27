import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  BANK_ALLOCATION_EPSILON,
  remainingBankTransactionAmount,
  sumBankTransactionAllocations,
} from "./bank-allocation.util";
import {
  amountsMatchAbsolute,
  amountsMatchWithinTolerance,
  BANK_DEBT_ABS_TOLERANCE,
  extractEdrpouFromDescription,
  extractDocumentRefsFromDescription,
  extractOrderCandidatesFromDescription,
  expectedPaymentAmountInCurrency,
  nameSimilarity,
  normalizeCounterpartyName,
  resolveOrderCandidates,
} from "./match-engine.utils";
import type {
  AutoMatchPlan,
  ClientMatchSuggestion,
  MatchConfidence,
  MatchReasonCode,
  OrderWithDebtSuggestion,
  ParsedDocumentsResult,
  ParsedOrdersResult,
  ProposedAllocation,
  TransactionMatchSuggestions,
} from "./match-suggestion.types";
import {
  documentConflictsWithOrderNumber,
  resolveUniqueDocumentOrder,
} from "./document-match.utils";

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  invoiceNumber: true,
  waybillNumber: true,
  debtAmount: true,
  currency: true,
  exchangeRate: true,
  contactId: true,
  clientId: true,
  companyId: true,
  contact: { select: { id: true, firstName: true, lastName: true } },
  client: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true, edrpou: true, taxId: true } },
} as const;

type OrderRow = {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  waybillNumber: string | null;
  debtAmount: number | null;
  currency: string;
  exchangeRate: number | null;
  contactId: string | null;
  clientId: string | null;
  companyId: string | null;
  contact: { id: string; firstName: string; lastName: string } | null;
  client: { id: string; firstName: string; lastName: string } | null;
  company: { id: string; name: string; edrpou: string | null; taxId: string | null } | null;
};

type ClientKey = string;

function clientKeyOf(order: OrderRow): ClientKey | null {
  if (order.companyId) return `company:${order.companyId}`;
  const contactId = order.contactId ?? order.clientId;
  if (contactId) return `contact:${contactId}`;
  return null;
}

function contactLabel(order: OrderRow): string {
  if (order.company?.name) return order.company.name;
  const c = order.contact ?? order.client;
  if (!c) return order.orderNumber;
  return [c.lastName, c.firstName].filter(Boolean).join(" ") || order.orderNumber;
}

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function confidenceFrom(score: number, reasons: MatchReasonCode[], warnings: string[]): MatchConfidence {
  if (warnings.includes("different_clients")) return "low";
  if (
    (reasons.includes("iban_history") && score >= 70) ||
    (reasons.includes("orders_in_purpose") && reasons.includes("amount_fit") && score >= 75)
  ) {
    return "high";
  }
  if (score >= 55) return "medium";
  return "low";
}

@Injectable()
export class MatchSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async getSuggestions(tx: {
    id: string;
    description: string | null;
    amount: { toString(): string } | number;
    currency?: string;
    bookedAt: Date;
    counterpartyName: string | null;
    counterpartyIban?: string | null;
    payments?: Array<{ amount: { toString(): string } | number; status?: string }>;
  }): Promise<TransactionMatchSuggestions> {
    const txAmount = Number(tx.amount);
    const txCurrency = (tx.currency ?? "UAH").toUpperCase();
    const payments = tx.payments ?? [];
    const allocatedAmount = sumBankTransactionAllocations(payments);
    const remainingAmount = remainingBankTransactionAmount(txAmount, payments);
    const matchAmount = remainingAmount > 0 ? remainingAmount : txAmount;

    const candidates = extractOrderCandidatesFromDescription(tx.description);
    const numbers = candidates.map((c) => c.orderNumber);
    const orders =
      numbers.length > 0
        ? await this.prisma.order.findMany({
            where: { orderNumber: { in: numbers } },
            select: ORDER_SELECT,
          })
        : [];
    const byNumber = new Map(orders.map((o) => [o.orderNumber, o as OrderRow]));
    const resolved = resolveOrderCandidates(candidates, byNumber);

    const explicitAmounts: Record<string, number> = {};
    for (const c of candidates) {
      if (c.explicitAmount != null) explicitAmounts[c.orderNumber] = c.explicitAmount;
    }

    const parsedOrders: ParsedOrdersResult = {
      found: resolved.found.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        explicitAmount: o.explicitAmount,
      })),
      notFound: resolved.notFound,
      explicitAmounts: Object.keys(explicitAmounts).length ? explicitAmounts : undefined,
    };

    const docRefs = extractDocumentRefsFromDescription(tx.description);
    const parsedDocuments: ParsedDocumentsResult = {
      invoices: docRefs.invoices,
      waybills: docRefs.waybills,
      unlabeled: docRefs.unlabeled,
    };

    let documentMatchOrderId: string | null = null;
    let docMatchInvoice: string | null = null;
    let docMatchWaybill: string | null = null;
    let docMatchReason: MatchReasonCode | null = null;
    let docAmbiguous = false;

    const orderNumberResolved =
      resolved.found.length === 1 ? resolved.found[0]!.id : null;
    const docResolved = await resolveUniqueDocumentOrder(this.prisma, docRefs);
    docAmbiguous = docResolved.ambiguous;
    if (
      docResolved.orderId &&
      !docAmbiguous &&
      !documentConflictsWithOrderNumber(orderNumberResolved, docResolved.orderId)
    ) {
      documentMatchOrderId = docResolved.orderId;
      docMatchInvoice = docResolved.invoiceNumber;
      docMatchWaybill = docResolved.waybillNumber;
      docMatchReason =
        docResolved.matchType === "invoice" ? "invoice_match" : "waybill_match";
    } else if (
      docResolved.orderId &&
      documentConflictsWithOrderNumber(orderNumberResolved, docResolved.orderId)
    ) {
      docAmbiguous = true;
    }

    if (docMatchInvoice) parsedDocuments.matchedInvoiceNumber = docMatchInvoice;
    if (docMatchWaybill) parsedDocuments.matchedWaybillNumber = docMatchWaybill;

    type Acc = {
      contactId: string | null;
      companyId: string | null;
      label: string;
      score: number;
      reasons: Set<MatchReasonCode>;
      orders: OrderRow[];
      warnings: Set<string>;
      matchedInvoiceNumber?: string | null;
      matchedWaybillNumber?: string | null;
    };
    const byClient = new Map<ClientKey, Acc>();

    const bump = (
      key: ClientKey,
      patch: Partial<Acc> & { reason?: MatchReasonCode; scoreAdd?: number; order?: OrderRow },
    ) => {
      let acc = byClient.get(key);
      if (!acc) {
        acc = {
          contactId: patch.contactId ?? null,
          companyId: patch.companyId ?? null,
          label: patch.label ?? "",
          score: 0,
          reasons: new Set(),
          orders: [],
          warnings: new Set(),
        };
        byClient.set(key, acc);
      }
      if (patch.contactId) acc.contactId = patch.contactId;
      if (patch.companyId) acc.companyId = patch.companyId;
      if (patch.label) acc.label = patch.label;
      if (patch.scoreAdd) acc.score += patch.scoreAdd;
      if (patch.reason) acc.reasons.add(patch.reason);
      if (patch.order && !acc.orders.some((o) => o.id === patch.order!.id)) {
        acc.orders.push(patch.order);
      }
    };

    // 1) IBAN history via PayerAlias + past payments
    const iban = tx.counterpartyIban?.replace(/\s+/g, "").toUpperCase() || null;
    if (iban) {
      const aliases = await this.prisma.payerAlias.findMany({
        where: { counterpartyIban: iban },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
        },
        take: 5,
      });
      for (const a of aliases) {
        const key: ClientKey | null = a.companyId
          ? `company:${a.companyId}`
          : a.contactId
            ? `contact:${a.contactId}`
            : null;
        if (!key) continue;
        const freshnessDays =
          (Date.now() - new Date(a.lastSeenAt).getTime()) / (24 * 60 * 60 * 1000);
        const freshnessBoost = freshnessDays <= 90 ? 10 : freshnessDays <= 365 ? 5 : 0;
        const hitBoost = Math.min(25, a.hitCount * 8);
        const label = a.company?.name
          ? a.company.name
          : a.contact
            ? [a.contact.lastName, a.contact.firstName].filter(Boolean).join(" ")
            : key;
        bump(key, {
          contactId: a.contactId,
          companyId: a.companyId,
          label,
          reason: "iban_history",
          scoreAdd: 40 + hitBoost + freshnessBoost,
        });
      }

      // Also boost from historical bank payments with same IBAN
      const hist = await this.prisma.payment.findMany({
        where: {
          status: "COMPLETED",
          bankTransaction: { counterpartyIban: { equals: iban, mode: "insensitive" } },
        },
        select: {
          order: {
            select: {
              contactId: true,
              clientId: true,
              companyId: true,
              company: { select: { id: true, name: true } },
              contact: { select: { id: true, firstName: true, lastName: true } },
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        take: 50,
        orderBy: { paidAt: "desc" },
      });
      const histCounts = new Map<ClientKey, { n: number; label: string; contactId: string | null; companyId: string | null }>();
      for (const p of hist) {
        const o = p.order;
        if (!o) continue;
        const key = o.companyId
          ? `company:${o.companyId}`
          : o.contactId || o.clientId
            ? `contact:${o.contactId ?? o.clientId}`
            : null;
        if (!key) continue;
        const label = o.company?.name
          ? o.company.name
          : (() => {
              const c = o.contact ?? o.client;
              return c ? [c.lastName, c.firstName].filter(Boolean).join(" ") : key;
            })();
        const prev = histCounts.get(key) ?? {
          n: 0,
          label,
          contactId: o.contactId ?? o.clientId,
          companyId: o.companyId,
        };
        prev.n++;
        histCounts.set(key, prev);
      }
      for (const [key, v] of histCounts) {
        bump(key, {
          contactId: v.contactId,
          companyId: v.companyId,
          label: v.label,
          reason: "iban_history",
          scoreAdd: Math.min(35, 15 + v.n * 10),
        });
      }
    }

    // 2) Orders in purpose
    const clientKeysFromOrders = new Set<ClientKey>();
    for (const order of resolved.found) {
      const key = clientKeyOf(order);
      if (!key) continue;
      clientKeysFromOrders.add(key);
      bump(key, {
        contactId: order.contactId ?? order.clientId,
        companyId: order.companyId,
        label: contactLabel(order),
        reason: "orders_in_purpose",
        scoreAdd: 35,
        order,
      });
    }

    // 2b) Unique invoice / waybill match from 1C documents
    if (documentMatchOrderId && docMatchReason) {
      const docOrder = await this.prisma.order.findUnique({
        where: { id: documentMatchOrderId },
        select: ORDER_SELECT,
      });
      if (docOrder) {
        const key = clientKeyOf(docOrder as OrderRow);
        if (key) {
          bump(key, {
            contactId: docOrder.contactId ?? docOrder.clientId,
            companyId: docOrder.companyId,
            label: contactLabel(docOrder as OrderRow),
            reason: docMatchReason,
            scoreAdd: docMatchReason === "invoice_match" ? 75 : 70,
            order: docOrder as OrderRow,
          });
          const acc = byClient.get(key);
          if (acc) {
            acc.matchedInvoiceNumber = docMatchInvoice;
            acc.matchedWaybillNumber = docMatchWaybill;
          }
        }
      }
    }
    if (docAmbiguous) {
      for (const acc of byClient.values()) {
        acc.warnings.add("document_ambiguous");
      }
    }
    if (clientKeysFromOrders.size > 1) {
      for (const key of clientKeysFromOrders) {
        byClient.get(key)?.warnings.add("different_clients");
      }
    }
    if (resolved.notFound.length) {
      for (const acc of byClient.values()) {
        if (acc.reasons.has("orders_in_purpose")) {
          acc.warnings.add("not_found_orders");
        }
      }
    }

    // 3) Name match (counterparty + alias by normalized name)
    const normName = normalizeCounterpartyName(tx.counterpartyName);
    if (normName.length >= 3) {
      const nameAliases = await this.prisma.payerAlias.findMany({
        where: { counterpartyNameNormalized: normName },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true } },
          company: { select: { id: true, name: true } },
        },
        take: 5,
      });
      for (const a of nameAliases) {
        const key: ClientKey | null = a.companyId
          ? `company:${a.companyId}`
          : a.contactId
            ? `contact:${a.contactId}`
            : null;
        if (!key) continue;
        const label = a.company?.name
          ? a.company.name
          : a.contact
            ? [a.contact.lastName, a.contact.firstName].filter(Boolean).join(" ")
            : key;
        bump(key, {
          contactId: a.contactId,
          companyId: a.companyId,
          label,
          reason: "name_match",
          scoreAdd: 25,
        });
      }

      const companies = await this.prisma.company.findMany({
        where: {
          OR: [
            { name: { contains: normName.slice(0, 24), mode: "insensitive" } },
            ...(normName.length >= 5
              ? [{ name: { contains: tx.counterpartyName!.slice(0, 24), mode: "insensitive" as const } }]
              : []),
          ],
        },
        select: { id: true, name: true },
        take: 20,
      });
      for (const co of companies) {
        const sim = nameSimilarity(tx.counterpartyName ?? "", co.name);
        if (sim < 0.55) continue;
        bump(`company:${co.id}`, {
          companyId: co.id,
          label: co.name,
          reason: "name_match",
          scoreAdd: Math.round(20 * sim),
        });
      }
    }

    // 4) EDRPOU / taxId
    const edrpou = extractEdrpouFromDescription(tx.description);
    if (edrpou) {
      const companies = await this.prisma.company.findMany({
        where: { OR: [{ edrpou }, { taxId: edrpou }] },
        select: { id: true, name: true },
        take: 5,
      });
      for (const co of companies) {
        bump(`company:${co.id}`, {
          companyId: co.id,
          label: co.name,
          reason: "edrpou",
          scoreAdd: 45,
        });
      }
    }

    // Load open orders with debt for each candidate client
    for (const [key, acc] of byClient) {
      if (acc.orders.length > 0) continue;
      const where = key.startsWith("company:")
        ? { companyId: key.slice("company:".length), debtAmount: { gt: 0 } }
        : {
            OR: [
              { contactId: key.slice("contact:".length) },
              { clientId: key.slice("contact:".length) },
            ],
            debtAmount: { gt: 0 },
          };
      const open = await this.prisma.order.findMany({
        where,
        select: ORDER_SELECT,
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      acc.orders = open as OrderRow[];
    }

    const suggestions: ClientMatchSuggestion[] = [];

    for (const acc of byClient.values()) {
      const ordersWithDebt: OrderWithDebtSuggestion[] = [];
      let debtSumTx = 0;
      for (const o of acc.orders) {
        const debt = Number(o.debtAmount ?? 0);
        if (debt <= 0 && !resolved.found.some((f) => f.id === o.id)) continue;
        const expected =
          expectedPaymentAmountInCurrency(debt, o.currency, txCurrency, o.exchangeRate) ??
          (o.currency.toUpperCase() === txCurrency ? debt : null);
        const suggestedAmount =
          explicitAmounts[o.orderNumber] ??
          (expected != null ? Math.min(expected, matchAmount) : 0);
        if (expected != null) debtSumTx += expected;
        ordersWithDebt.push({
          orderId: o.id,
          orderNumber: o.orderNumber,
          debtAmount: debt,
          currency: o.currency,
          suggestedAmount: Math.round(suggestedAmount * 100) / 100,
        });
      }

      if (debtSumTx > 0 && amountsMatchAbsolute(debtSumTx, matchAmount, BANK_DEBT_ABS_TOLERANCE)) {
        acc.reasons.add("amount_fit");
        acc.score += 20;
      } else if (
        ordersWithDebt.length === 1 &&
        amountsMatchWithinTolerance(ordersWithDebt[0]!.suggestedAmount, matchAmount)
      ) {
        acc.reasons.add("amount_fit");
        acc.score += 15;
      } else if (ordersWithDebt.length >= 1 && debtSumTx > 0) {
        const ratio = Math.abs(debtSumTx - matchAmount) / Math.max(debtSumTx, matchAmount);
        if (ratio <= 0.05) {
          acc.reasons.add("amount_fit");
          acc.score += 8;
        } else {
          acc.warnings.add("amount_mismatch");
        }
      }

      if (debtSumTx > 0 && matchAmount > debtSumTx + BANK_DEBT_ABS_TOLERANCE) {
        acc.warnings.add("overpay");
      }

      const reasons = [...acc.reasons];
      const warnings = [...acc.warnings];
      const score = clampScore(acc.score);
      const proposedAllocations = this.buildProposedAllocations({
        orders: acc.orders,
        explicitAmounts,
        matchAmount,
        txCurrency,
      });

      suggestions.push({
        contactId: acc.contactId,
        companyId: acc.companyId,
        label: acc.label || "—",
        score,
        confidence: confidenceFrom(score, reasons, warnings),
        reasons,
        ordersWithDebt,
        proposedAllocations: proposedAllocations.length ? proposedAllocations : undefined,
        warnings: warnings.length ? warnings : undefined,
        matchedInvoiceNumber: acc.matchedInvoiceNumber ?? null,
        matchedWaybillNumber: acc.matchedWaybillNumber ?? null,
      });
    }

    suggestions.sort((a, b) => b.score - a.score);

    const autoPlan = this.buildAutoMatchPlan({
      resolvedFound: resolved.found,
      notFound: resolved.notFound,
      explicitAmounts,
      matchAmount,
      txCurrency,
      allocatedAmount,
    });

    return {
      transactionId: tx.id,
      suggestions: suggestions.slice(0, 8),
      parsedOrders,
      parsedDocuments,
      documentMatchOrderId,
      autoMatchEligible: autoPlan != null,
      autoMatchPlan: autoPlan ?? undefined,
      allocatedAmount,
      remainingAmount,
    };
  }

  private buildProposedAllocations(ctx: {
    orders: OrderRow[];
    explicitAmounts: Record<string, number>;
    matchAmount: number;
    txCurrency: string;
  }): ProposedAllocation[] {
    const withPurpose = ctx.orders.filter((o) => ctx.explicitAmounts[o.orderNumber] != null);
    if (withPurpose.length > 0) {
      return withPurpose.map((o) => ({
        orderId: o.id,
        amount: ctx.explicitAmounts[o.orderNumber]!,
        source: "purpose_amount" as const,
      }));
    }

    const debts = ctx.orders
      .map((o) => {
        const debt = Number(o.debtAmount ?? 0);
        const expected =
          expectedPaymentAmountInCurrency(debt, o.currency, ctx.txCurrency, o.exchangeRate) ?? 0;
        return { orderId: o.id, expected };
      })
      .filter((d) => d.expected > 0);

    if (debts.length === 0) return [];

    const sum = debts.reduce((s, d) => s + d.expected, 0);
    if (amountsMatchAbsolute(sum, ctx.matchAmount, BANK_DEBT_ABS_TOLERANCE)) {
      return debts.map((d) => ({
        orderId: d.orderId,
        amount: Math.round(d.expected * 100) / 100,
        source: "debt" as const,
      }));
    }

    // Proportional fallback for UI prefill only (not auto).
    return debts.map((d) => ({
      orderId: d.orderId,
      amount: Math.round(((d.expected / sum) * ctx.matchAmount) * 100) / 100,
      source: "proportional" as const,
    }));
  }

  /**
   * Multi-order auto is eligible only when:
   * - ≥2 valid orderNumbers in DB
   * - all same client (company or contact)
   * - explicit amounts sum ≈ remaining OR debt sum ≈ remaining
   * - no existing payments (full tx) — caller may also check remaining
   * - not overpay without explicit amounts
   */
  buildAutoMatchPlan(ctx: {
    resolvedFound: Array<OrderRow & { explicitAmount?: number }>;
    notFound: string[];
    explicitAmounts: Record<string, number>;
    matchAmount: number;
    txCurrency: string;
    allocatedAmount: number;
  }): AutoMatchPlan | null {
    if (ctx.allocatedAmount > BANK_ALLOCATION_EPSILON) return null;
    if (ctx.resolvedFound.length < 2) return null;
    if (ctx.notFound.length > 0) return null;

    const keys = new Set(
      ctx.resolvedFound.map((o) => clientKeyOf(o)).filter((k): k is string => k != null),
    );
    if (keys.size !== 1) return null;

    const withExplicit = ctx.resolvedFound.filter((o) => o.explicitAmount != null);
    if (withExplicit.length === ctx.resolvedFound.length) {
      const sum = withExplicit.reduce((s, o) => s + Number(o.explicitAmount), 0);
      if (!amountsMatchAbsolute(sum, ctx.matchAmount, BANK_ALLOCATION_EPSILON)) return null;
      return {
        allocations: this.fitAllocationsToAmount(
          withExplicit.map((o) => ({
            orderId: o.id,
            amount: Number(o.explicitAmount),
            source: "purpose_amount" as const,
          })),
          ctx.matchAmount,
        ),
        reason: "multi_order_purpose_amounts",
      };
    }

    // Debt-based: reject overpay without explicit amounts
    const debtParts = ctx.resolvedFound.map((o) => {
      const debt = Number(o.debtAmount ?? 0);
      const expected =
        expectedPaymentAmountInCurrency(debt, o.currency, ctx.txCurrency, o.exchangeRate) ?? 0;
      return { orderId: o.id, expected };
    });
    if (debtParts.some((d) => d.expected <= 0)) return null;
    const debtSum = debtParts.reduce((s, d) => s + d.expected, 0);
    if (ctx.matchAmount > debtSum + BANK_DEBT_ABS_TOLERANCE) return null; // overpay
    if (!amountsMatchAbsolute(debtSum, ctx.matchAmount, BANK_DEBT_ABS_TOLERANCE)) return null;

    return {
      allocations: this.fitAllocationsToAmount(
        debtParts.map((d) => ({
          orderId: d.orderId,
          amount: Math.round(d.expected * 100) / 100,
          source: "debt" as const,
        })),
        ctx.matchAmount,
      ),
      reason: "multi_order_debt_sum",
    };
  }

  /** Ensure allocation amounts sum to target within 0.01 by adjusting the last row. */
  private fitAllocationsToAmount(
    allocations: ProposedAllocation[],
    target: number,
  ): ProposedAllocation[] {
    if (allocations.length === 0) return allocations;
    const out = allocations.map((a) => ({
      ...a,
      amount: Math.round(Number(a.amount) * 100) / 100,
    }));
    const sumExceptLast = out.slice(0, -1).reduce((s, a) => s + a.amount, 0);
    const last = out[out.length - 1]!;
    last.amount = Math.round((target - sumExceptLast) * 100) / 100;
    if (last.amount <= 0) return allocations; // caller will reject
    return out;
  }
}
