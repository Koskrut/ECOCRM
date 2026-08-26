"use client";

import Link from "next/link";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiHttp } from "@/lib/api/client";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { strings as t } from "@/locales";
import { formatDate } from "@/lib/crmDatetime";
import { useToast } from "@/components/feedback";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import {
  debtInPaymentCurrency,
  formatDebtForAllocation,
  suggestedAllocationAmount,
} from "@/lib/debt-in-payment-currency";
import {
  convertPaymentToUsd,
  paymentUsdVarianceExceedsTolerance,
  type ExchangeRates,
} from "@/lib/payment-usd";
import { ordersApi, type FxVarianceQueueItem } from "@/lib/api/resources/orders";
import { FxWriteOffModal } from "./FxWriteOffModal";
import { InfiniteScrollSentinel } from "@/components/InfiniteScrollSentinel";
import { HelpHint } from "@/components/help/HelpHint";
import { useModules } from "@/lib/modules/useModules";
import { ModuleIds } from "@/lib/modules/module-ids";

const PAGE_SIZE = 50;

type PaymentsView = "payments" | "unmatched" | "ignored" | "fxVariance";

const IGNORE_CATEGORY_KEYS = [
  "BANK_FEE",
  "TAX",
  "OWN_TRANSFER",
  "OWN_COMPANY",
  "CASH_WITHDRAWAL",
  "OTHER_EXPENSE",
  "OTHER",
] as const;
type IgnoreCategoryKey = (typeof IGNORE_CATEGORY_KEYS)[number];

type BankAccount = { id: string; name: string; currency: string; provider?: string };

type PaymentItem = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  /** Display: contact on order (contact ?? client). */
  contactLabel?: string | null;
  /** For bank payments: all order numbers that share this bank transaction (split). */
  sameTransactionOrderNumbers?: string[] | null;
  sourceType: string;
  amount: number;
  currency: string;
  amountUsd: number;
  paidAt: string;
  status: string;
  note: string | null;
  bankTransaction: {
    id: string;
    bankAccountId: string;
    bankAccount: { id: string; name: string; currency: string };
    bookedAt: string;
    description: string | null;
    counterpartyName: string | null;
    matchStatus?: string | null;
  } | null;
  createdBy: { id: string; fullName: string } | null;
};

type ClientMatchSuggestion = {
  contactId?: string | null;
  companyId?: string | null;
  label: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  ordersWithDebt: Array<{
    orderId: string;
    orderNumber: string;
    debtAmount: number;
    currency: string;
    suggestedAmount: number;
  }>;
  proposedAllocations?: Array<{
    orderId: string;
    amount: number;
    source: string;
  }>;
  warnings?: string[];
  matchedInvoiceNumber?: string | null;
  matchedWaybillNumber?: string | null;
};

type BankTransaction = {
  id: string;
  bankAccountId: string;
  bankAccount: { id: string; name: string; currency: string };
  externalId: string;
  bookedAt: string;
  amount: number;
  currency: string;
  direction: string;
  description: string | null;
  counterpartyName: string | null;
  counterpartyIban: string | null;
  paymentId: string | null;
  orderId: string | null;
  matchStatus?: string | null;
  ignoreCategory?: string | null;
  ignoreSource?: string | null;
  ignoredAt?: string | null;
  allocatedAmount?: number;
  remainingAmount?: number;
  suggestion?: {
    orderId: string;
    orderNumber: string;
    contactLabel: string;
    debtAmount: number;
    currency: string;
    expectedAmountUah: number | null;
    score: number;
    invoiceNumber?: string | null;
    waybillNumber?: string | null;
    documentMatchType?: "invoice" | "waybill" | null;
  } | null;
  suggestions?: ClientMatchSuggestion[];
  parsedOrders?: {
    found: Array<{ orderId: string; orderNumber: string; explicitAmount?: number }>;
    notFound: string[];
  };
  parsedDocuments?: {
    invoices: string[];
    waybills: string[];
    unlabeled: string[];
    matchedInvoiceNumber?: string | null;
    matchedWaybillNumber?: string | null;
  };
  autoMatchEligible?: boolean;
  autoMatchPlan?: {
    allocations: Array<{ orderId: string; amount: number; source: string }>;
    reason: string;
  };
};

function reasonLabel(code: string): string {
  switch (code) {
    case "iban_history":
      return t.payments.reasonIbanHistory;
    case "orders_in_purpose":
      return t.payments.reasonOrdersInPurpose;
    case "invoice_match":
      return t.payments.reasonInvoiceMatch;
    case "waybill_match":
      return t.payments.reasonWaybillMatch;
    case "name_match":
      return t.payments.reasonNameMatch;
    case "edrpou":
      return t.payments.reasonEdrpou;
    case "amount_fit":
      return t.payments.reasonAmountFit;
    default:
      return code;
  }
}

type OrderOption = {
  id: string;
  orderNumber: string;
  invoiceNumber?: string | null;
  waybillNumber?: string | null;
  totalAmount?: number;
  paidAmount?: number;
  debtAmount?: number;
  currency?: string;
  exchangeRate?: number | null;
  paymentDueDate?: string | null;
  createdAt?: string;
};

function formatOrderSearchLabel(o: OrderOption): string {
  const parts = [o.orderNumber || o.id];
  if (o.invoiceNumber?.trim()) parts.push(t.payments.invoiceLabel(o.invoiceNumber.trim()));
  if (o.waybillNumber?.trim()) parts.push(t.payments.waybillLabel(o.waybillNumber.trim()));
  return parts.join(" · ");
}

type ContactOption = { id: string; firstName: string; lastName: string; phone: string };

type BankPaymentGroup = {
  key: string;
  payments: PaymentItem[];
  isSplit: boolean;
  totalAmount: number;
  totalAmountUsd: number;
  primary: PaymentItem;
};

function getGroupContactLabel(group: BankPaymentGroup): string {
  const labels = group.payments
    .map((p) => p.contactLabel?.trim())
    .filter(Boolean) as string[];
  if (labels.length === 0) return t.payments.dash;
  const unique = [...new Set(labels)];
  if (unique.length === 1) return unique[0]!;
  return t.payments.multipleContacts;
}

function filterBySearch<T>(items: T[], search: string, getText: (t: T) => string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((t) => getText(t).toLowerCase().includes(q));
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function formatPaymentAmount(p: { amount: number; currency: string; amountUsd?: number }): string {
  const usd = p.amountUsd ?? (p.currency === "USD" ? p.amount : 0);
  const sym = p.currency === "UAH" ? "₴" : p.currency === "EUR" ? "€" : "$";
  if (p.currency === "USD") {
    return `${p.amount.toFixed(2)} $`;
  }
  return `${p.amount.toFixed(2)} ${sym} (${usd.toFixed(2)} $)`;
}

type SplitRow = { orderId: string; orderNumber: string; amount: string };

function orderDebtInPaymentCurrency(order: OrderOption, paymentCurrency: string): number {
  const debt = Number(order.debtAmount ?? 0);
  if (!(debt > 0)) return 0;
  return debtInPaymentCurrency(debt, "USD", paymentCurrency, order.exchangeRate) ?? 0;
}

/** Prefill split rows using debts converted into the payment currency (FIFO by due date). */
function buildSplitRowsFromOrdersFifo(
  orders: OrderOption[],
  totalAmount: number,
  paymentCurrency: string,
): SplitRow[] {
  const sorted = [...orders].sort((a, b) => {
    const aDue = a.paymentDueDate ? new Date(a.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const bDue = b.paymentDueDate ? new Date(b.paymentDueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });
  const debts = sorted.map((o) => orderDebtInPaymentCurrency(o, paymentCurrency));
  const totalDebt = debts.reduce((s, d) => s + d, 0);
  let rows: SplitRow[];
  if (totalDebt > 0) {
    let remaining = totalAmount;
    rows = sorted.map((o, i) => {
      const debt = debts[i] ?? 0;
      const amount = Math.min(remaining, debt);
      remaining -= amount;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber ?? o.id,
        amount: amount.toFixed(2),
      };
    });
    if (remaining > 0.01 && rows.length > 0) {
      rows[rows.length - 1]!.amount = (
        parseFloat(rows[rows.length - 1]!.amount) + remaining
      ).toFixed(2);
    }
  } else if (sorted.length > 0) {
    const perOrder = totalAmount / sorted.length;
    rows = sorted.map((o, i) => ({
      orderId: o.id,
      orderNumber: o.orderNumber ?? o.id,
      amount: (
        i === sorted.length - 1 ? totalAmount - perOrder * (sorted.length - 1) : perOrder
      ).toFixed(2),
    }));
  } else {
    rows = [];
  }
  return rows.filter((r) => parseFloat(r.amount) > 0);
}

/** Prefill split rows using debts converted into the payment currency. */
function buildSplitRowsFromOrders(
  orders: OrderOption[],
  totalAmount: number,
  paymentCurrency: string,
): SplitRow[] {
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
  );
  const debts = sorted.map((o) => orderDebtInPaymentCurrency(o, paymentCurrency));
  const totalDebt = debts.reduce((s, d) => s + d, 0);
  let rows: SplitRow[];
  if (totalDebt > 0) {
    let remaining = totalAmount;
    rows = sorted.map((o, i) => {
      const debt = debts[i] ?? 0;
      const amount = Math.min(remaining, debt);
      remaining -= amount;
      return {
        orderId: o.id,
        orderNumber: o.orderNumber ?? o.id,
        amount: amount.toFixed(2),
      };
    });
    if (remaining > 0.01 && rows.length > 0) {
      rows[rows.length - 1]!.amount = (
        parseFloat(rows[rows.length - 1]!.amount) + remaining
      ).toFixed(2);
    }
  } else {
    const perOrder = totalAmount / sorted.length;
    rows = sorted.map((o, i) => ({
      orderId: o.id,
      orderNumber: o.orderNumber ?? o.id,
      amount: (
        i === sorted.length - 1 ? totalAmount - perOrder * (sorted.length - 1) : perOrder
      ).toFixed(2),
    }));
  }
  return rows.filter((r) => parseFloat(r.amount) > 0);
}

function formatOrderOptionAmounts(order: OrderOption, paymentCurrency: string): string {
  const label = formatDebtForAllocation(order, paymentCurrency);
  return label ? ` · ${label}` : "";
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div>{t.common.loading}</div>}>
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  const { pushToast } = useToast();
  const { effective: moduleEffective } = useModules();
  const oneCPaymentsEnabled = moduleEffective(ModuleIds.OneCPayments);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const bankAccountId = searchParams.get("bankAccountId") ?? "";
  const urlSearch = searchParams.get("search") ?? "";
  const urlDateFrom = searchParams.get("dateFrom") ?? "";
  const urlDateTo = searchParams.get("dateTo") ?? "";
  const [mode, setMode] = useState<"cash" | "fop">("fop");
  const initialView: PaymentsView =
    viewParam === "payments"
      ? "payments"
      : viewParam === "fxVariance"
        ? "fxVariance"
        : viewParam === "ignored"
          ? "ignored"
          : "unmatched";
  const [view, setView] = useState<PaymentsView>(initialView);

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [searchInput, setSearchInput] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);
  const [dateFrom, setDateFrom] = useState(urlDateFrom);
  const [dateTo, setDateTo] = useState(urlDateTo);

  const setBankAccountId = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("bankAccountId", value);
      else params.delete("bankAccountId");
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsHasMore, setPaymentsHasMore] = useState(false);
  const [unmatched, setUnmatched] = useState<BankTransaction[]>([]);
  const [unmatchedTotal, setUnmatchedTotal] = useState(0);
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [unmatchedHasMore, setUnmatchedHasMore] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsLoadingMore, setPaymentsLoadingMore] = useState(false);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
  const [unmatchedLoadingMore, setUnmatchedLoadingMore] = useState(false);
  const [ignoreTxId, setIgnoreTxId] = useState<string | null>(null);
  const [ignoreCategory, setIgnoreCategory] = useState<IgnoreCategoryKey>("OTHER_EXPENSE");
  const [ignoring, setIgnoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAddStatement, setShowAddStatement] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [allocateTxId, setAllocateTxId] = useState<string | null>(null);
  const [allocateTx, setAllocateTx] = useState<BankTransaction | null>(null);
  const [allocateContactSearch, setAllocateContactSearch] = useState("");
  const [allocateContacts, setAllocateContacts] = useState<ContactOption[]>([]);
  const [allocateContactsLoading, setAllocateContactsLoading] = useState(false);
  const [allocateContactId, setAllocateContactId] = useState<string | null>(null);
  const [allocateContactName, setAllocateContactName] = useState("");
  const [allocateOrders, setAllocateOrders] = useState<OrderOption[]>([]);
  const [allocateOrdersLoading, setAllocateOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [allocateOrderNumber, setAllocateOrderNumber] = useState("");
  const [allocating, setAllocating] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderCandidates, setOrderCandidates] = useState<OrderOption[]>([]);
  const [editPayment, setEditPayment] = useState<PaymentItem | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCurrency, setEditCurrency] = useState("UAH");
  const [editPaidAt, setEditPaidAt] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editOrderId, setEditOrderId] = useState<string>("");
  const [editOrderNumber, setEditOrderNumber] = useState<string>("");
  const [editOrderSearch, setEditOrderSearch] = useState("");
  const [editOrderCandidates, setEditOrderCandidates] = useState<OrderOption[]>([]);
  const [editContactSearch, setEditContactSearch] = useState("");
  const [editContacts, setEditContacts] = useState<ContactOption[]>([]);
  const [editContactsLoading, setEditContactsLoading] = useState(false);
  const [editContactId, setEditContactId] = useState<string | null>(null);
  const [editContactName, setEditContactName] = useState("");
  const [editContactOrders, setEditContactOrders] = useState<OrderOption[]>([]);
  const [editContactOrdersLoading, setEditContactOrdersLoading] = useState(false);
  const [editAmountUsd, setEditAmountUsd] = useState("");
  const [editAmountUsdTouched, setEditAmountUsdTouched] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [showAddCashPayment, setShowAddCashPayment] = useState(false);
  const [addCashContactSearch, setAddCashContactSearch] = useState("");
  const [addCashContacts, setAddCashContacts] = useState<ContactOption[]>([]);
  const [addCashContactsLoading, setAddCashContactsLoading] = useState(false);
  const [addCashContactId, setAddCashContactId] = useState<string | null>(null);
  const [addCashContactName, setAddCashContactName] = useState("");
  const [addCashOrders, setAddCashOrders] = useState<OrderOption[]>([]);
  const [addCashOrdersLoading, setAddCashOrdersLoading] = useState(false);
  const [addCashOrderId, setAddCashOrderId] = useState<string | null>(null);
  const [addCashOrderNumber, setAddCashOrderNumber] = useState("");
  const [addCashAmount, setAddCashAmount] = useState("");
  const [addCashCurrency, setAddCashCurrency] = useState<"UAH" | "USD" | "EUR">("UAH");
  const [addCashPaidAt, setAddCashPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [addCashNote, setAddCashNote] = useState("");
  const [addCashSplitRows, setAddCashSplitRows] = useState<SplitRow[]>([]);
  const [addCashConfirmDuplicate, setAddCashConfirmDuplicate] = useState(false);
  const [addCashSubmitting, setAddCashSubmitting] = useState(false);
  const addCashIdempotencyKeyRef = useRef<string | null>(null);
  const addCashLastSubmitAtRef = useRef(0);
  const [splitTx, setSplitTx] = useState<BankTransaction | null>(null);
  const [splitFromEditPayment, setSplitFromEditPayment] = useState<PaymentItem | null>(null);
  const [splitRows, setSplitRows] = useState<{ orderId: string; orderNumber: string; amount: string }[]>([]);
  const [splitOrderSearch, setSplitOrderSearch] = useState("");
  const [splitOrderCandidates, setSplitOrderCandidates] = useState<OrderOption[]>([]);
  const [splitOrderForRowIndex, setSplitOrderForRowIndex] = useState<number | null>(null);
  const [splitSubmitting, setSplitSubmitting] = useState(false);
  const [bankSyncLoading, setBankSyncLoading] = useState(false);
  const [splitContactId, setSplitContactId] = useState<string | null>(null);
  const [splitContactName, setSplitContactName] = useState("");
  const [splitContactSearch, setSplitContactSearch] = useState("");
  const [splitContacts, setSplitContacts] = useState<ContactOption[]>([]);
  const [splitContactsLoading, setSplitContactsLoading] = useState(false);
  const [splitClientOrders, setSplitClientOrders] = useState<OrderOption[]>([]);
  const [splitClientOrdersLoading, setSplitClientOrdersLoading] = useState(false);
  const [expandedSplitKeys, setExpandedSplitKeys] = useState<Set<string>>(new Set());
  const [fxQueue, setFxQueue] = useState<FxVarianceQueueItem[]>([]);
  const [fxQueueTotal, setFxQueueTotal] = useState(0);
  const [fxSummaryCount, setFxSummaryCount] = useState(0);
  const [fxQueueLoading, setFxQueueLoading] = useState(false);
  const [fxWriteOffOrder, setFxWriteOffOrder] = useState<FxVarianceQueueItem | null>(null);

  const setViewWithUrl = useCallback(
    (next: PaymentsView) => {
      setView(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === "unmatched") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  useEffect(() => {
    apiHttp
      .get<ExchangeRates>("/settings/exchange-rates")
      .then((res) => setExchangeRates(res.data ?? null))
      .catch(() => setExchangeRates(null));
  }, []);

  const editPreviewUsd = useMemo(() => {
    if (!exchangeRates || editPayment?.sourceType !== "CASH") return null;
    const num = parseFloat(editAmount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) return null;
    const cur = (editCurrency || editPayment.currency || "UAH").trim().toUpperCase();
    return convertPaymentToUsd(num, cur, exchangeRates);
  }, [editAmount, editCurrency, editPayment, exchangeRates]);

  const editUsdFxWarning = useMemo(() => {
    if (!exchangeRates || editPayment?.sourceType !== "CASH" || !editAmountUsdTouched) return false;
    const num = parseFloat(editAmount.replace(/,/g, "."));
    const usd = parseFloat(editAmountUsd.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0 || !Number.isFinite(usd)) return false;
    const cur = (editCurrency || editPayment.currency || "UAH").trim().toUpperCase();
    return paymentUsdVarianceExceedsTolerance(num, cur, usd, exchangeRates);
  }, [editAmount, editAmountUsd, editAmountUsdTouched, editCurrency, editPayment, exchangeRates]);

  const fetchAccounts = useCallback(async () => {
    try {
      const r = await apiHttp.get<
        | BankAccount[]
        | { accounts: BankAccount[]; defaultBankAccountId?: string | null }
      >("/bank/accounts/for-order");
      const d = r.data;
      if (Array.isArray(d)) {
        setAccounts(d);
      } else {
        setAccounts(Array.isArray(d?.accounts) ? d.accounts : []);
      }
    } catch {
      setAccounts([]);
    }
  }, []);

  // Default stays «Усі» — do not auto-apply user FOP filter (payments were hidden on wrong account).

  const fetchPayments = useCallback(
    async (opts?: { page?: number; append?: boolean; bankIdOverride?: string }) => {
      const page = opts?.page ?? 1;
      const append = opts?.append ?? false;
      const sourceType = mode === "cash" ? "CASH" : "BANK";

      if (append) {
        setPaymentsLoadingMore(true);
      } else {
        setPaymentsLoading(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          sourceType,
        });
        const bid = opts?.bankIdOverride !== undefined ? opts.bankIdOverride : bankAccountId;
        if (bid) params.set("bankAccountId", bid);
        const q = debouncedSearch.trim();
        if (q) params.set("q", q);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const r = await apiHttp.get<{ items: PaymentItem[]; total: number }>(
          `/payments?${params.toString()}`,
        );
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        const total = r.data?.total ?? 0;
        setPayments((prev) => {
          const merged = append ? dedupeById([...prev, ...items]) : items;
          setPaymentsHasMore(merged.length < total);
          return merged;
        });
        setPaymentsTotal(total);
        setPaymentsPage(page);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.payments.errors.loadPayments);
      } finally {
        setPaymentsLoading(false);
        setPaymentsLoadingMore(false);
      }
    },
    [bankAccountId, debouncedSearch, dateFrom, dateTo, mode],
  );

  const fetchUnmatched = useCallback(
    async (opts?: {
      page?: number;
      append?: boolean;
      ignored?: boolean;
      /** Keep the list mounted (no full-page spinner) and restore scroll after. */
      silent?: boolean;
      /** When refreshing in place, reload pages 1..N so deep scroll position stays usable. */
      reloadThroughPage?: number;
    }) => {
      const append = opts?.append ?? false;
      const ignored = opts?.ignored ?? false;
      const silent = opts?.silent ?? false;
      const reloadThroughPage = Math.max(1, opts?.reloadThroughPage ?? opts?.page ?? 1);
      const page = append ? (opts?.page ?? 1) : 1;
      const pageSize = append ? PAGE_SIZE : reloadThroughPage * PAGE_SIZE;

      if (append) {
        setUnmatchedLoadingMore(true);
      } else if (!silent) {
        setUnmatchedLoading(true);
      }
      setError(null);
      const scrollY = silent && typeof window !== "undefined" ? window.scrollY : null;
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (ignored) {
          params.set("ignored", "true");
        } else {
          params.set("unmatched", "true");
          params.set("suggest", "true");
        }
        if (bankAccountId) params.set("bankAccountId", bankAccountId);
        const q = debouncedSearch.trim();
        if (q) params.set("q", q);
        if (dateFrom) params.set("from", dateFrom);
        if (dateTo) params.set("to", dateTo);
        const r = await apiHttp.get<{ items: BankTransaction[]; total: number }>(
          `/bank/transactions?${params.toString()}`,
        );
        const items = r.data?.items ?? [];
        const total = r.data?.total ?? 0;
        setUnmatched((prev) => {
          const merged = append ? dedupeById([...prev, ...items]) : items;
          setUnmatchedHasMore(merged.length < total);
          return merged;
        });
        setUnmatchedTotal(total);
        setUnmatchedPage(append ? page : reloadThroughPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.payments.errors.load);
        if (!append) {
          setUnmatched([]);
          setUnmatchedTotal(0);
        }
      } finally {
        setUnmatchedLoading(false);
        setUnmatchedLoadingMore(false);
        if (scrollY != null) {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY);
          });
        }
      }
    },
    [bankAccountId, debouncedSearch, dateFrom, dateTo],
  );

  const loadMorePayments = useCallback(() => {
    if (paymentsLoading || paymentsLoadingMore || !paymentsHasMore) return;
    void fetchPayments({ page: paymentsPage + 1, append: true });
  }, [paymentsLoading, paymentsLoadingMore, paymentsHasMore, paymentsPage, fetchPayments]);

  const loadMoreUnmatched = useCallback(() => {
    if (unmatchedLoading || unmatchedLoadingMore || !unmatchedHasMore) return;
    void fetchUnmatched({
      page: unmatchedPage + 1,
      append: true,
      ignored: view === "ignored",
    });
  }, [
    unmatchedLoading,
    unmatchedLoadingMore,
    unmatchedHasMore,
    unmatchedPage,
    fetchUnmatched,
    view,
  ]);

  const refreshQueue = useCallback(
    (opts?: { silent?: boolean }) => {
      return fetchUnmatched({
        ignored: view === "ignored",
        silent: opts?.silent,
        reloadThroughPage: unmatchedPage,
      });
    },
    [fetchUnmatched, view, unmatchedPage],
  );

  const submitIgnore = async () => {
    if (!ignoreTxId) return;
    setIgnoring(ignoreTxId);
    try {
      await apiHttp.post(`/bank/transactions/${ignoreTxId}/ignore`, {
        category: ignoreCategory,
      });
      setIgnoreTxId(null);
      pushToast(t.payments.notClient, "success");
      await refreshQueue({ silent: true });
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.load, "error");
    } finally {
      setIgnoring(null);
    }
  };

  const submitUnignore = async (transactionId: string) => {
    setIgnoring(transactionId);
    try {
      await apiHttp.post(`/bank/transactions/${transactionId}/unignore`, {});
      pushToast(t.payments.restoreToQueue, "success");
      await refreshQueue({ silent: true });
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.load, "error");
    } finally {
      setIgnoring(null);
    }
  };

  const fetchFxVariance = useCallback(async () => {
    setFxQueueLoading(true);
    setError(null);
    try {
      const [queue, summary] = await Promise.all([
        ordersApi.getFxVarianceQueue({ page: 1, pageSize: 500 }),
        ordersApi.getFxVarianceSummary(),
      ]);
      setFxQueue(queue.items);
      setFxQueueTotal(queue.total);
      setFxSummaryCount(summary.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.payments.fxVariance.errors.load);
      setFxQueue([]);
      setFxQueueTotal(0);
    } finally {
      setFxQueueLoading(false);
    }
  }, []);

  const runBankSync = useCallback(
    async (opts?: { forYesterday?: boolean }) => {
      setBankSyncLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (bankAccountId) params.set("bankAccountId", bankAccountId);
        if (opts?.forYesterday) {
          const d = new Date();
          d.setDate(d.getDate() - 1);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          params.set("from", `${yyyy}-${mm}-${dd}`);
          params.set("to", `${yyyy}-${mm}-${dd}`);
        }
        const url = `/api/bank/sync${params.toString() ? `?${params.toString()}` : ""}`;
        const r = await fetch(url, { method: "POST", credentials: "include" });
        const syncBody = await r.text();
        if (!r.ok) throw new Error(syncBody);
        const syncData = (() => {
          try {
            return JSON.parse(syncBody) as { errors?: { message: string }[] };
          } catch {
            return {};
          }
        })();
        if (syncData.errors?.length) {
          setError(syncData.errors.map((e) => e.message).join(" "));
        } else {
          setError(null);
        }
        setSearchInput("");
        setDebouncedSearch("");
        await fetchPayments({ bankIdOverride: undefined });
        await fetchUnmatched();
        await fetchAccounts();
      } catch (e) {
        setError(e instanceof Error ? e.message : t.payments.errors.syncFailed);
      } finally {
        setBankSyncLoading(false);
      }
    },
    [bankAccountId, fetchPayments, fetchUnmatched, fetchAccounts],
  );

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const fromUrl = searchParams.get("search") ?? "";
    if (fromUrl !== searchInput) {
      setSearchInput(fromUrl);
      setDebouncedSearch(fromUrl);
    }
    const nextFrom = searchParams.get("dateFrom") ?? "";
    const nextTo = searchParams.get("dateTo") ?? "";
    if (nextFrom !== dateFrom) setDateFrom(nextFrom);
    if (nextTo !== dateTo) setDateTo(nextTo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync when URL params change externally
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = debouncedSearch.trim();
    if (trimmed) params.set("search", trimmed);
    else params.delete("search");
    if (dateFrom) params.set("dateFrom", dateFrom);
    else params.delete("dateFrom");
    if (dateTo) params.set("dateTo", dateTo);
    else params.delete("dateTo");
    if (/^\d+$/.test(trimmed)) params.delete("bankAccountId");
    const q = params.toString();
    const next = q ? `${pathname}?${q}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next !== current) router.replace(next, { scroll: false });
  }, [debouncedSearch, dateFrom, dateTo, pathname, router, searchParams]);

  useEffect(() => {
    if (mode === "cash" || (mode === "fop" && view === "payments")) {
      fetchPayments(mode === "cash" ? { bankIdOverride: "" } : undefined);
    }
  }, [mode, view, fetchPayments]);

  useEffect(() => {
    if (mode === "fop" && (view === "unmatched" || view === "ignored")) {
      void fetchUnmatched({ ignored: view === "ignored" });
    }
  }, [mode, view, fetchUnmatched]);

  useEffect(() => {
    if (mode === "fop" && view === "fxVariance") void fetchFxVariance();
  }, [mode, view, fetchFxVariance]);

  useEffect(() => {
    if (mode !== "fop") return;
    ordersApi
      .getFxVarianceSummary()
      .then((s) => setFxSummaryCount(s.count))
      .catch(() => setFxSummaryCount(0));
  }, [mode]);

  const cashPayments = useMemo(
    () => payments.filter((p) => p.sourceType === "CASH"),
    [payments],
  );
  const allBankPayments = useMemo(
    () => payments.filter((p) => String(p.sourceType ?? "").toUpperCase() === "BANK"),
    [payments],
  );
  const bankPaymentGroupsAll = useMemo(() => {
    const map = new Map<string, PaymentItem[]>();
    for (const p of allBankPayments) {
      const key = p.bankTransaction?.id ?? p.id;
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, groupPayments]) => {
        const sorted = [...groupPayments].sort(
          (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
        );
        const primary = sorted[0]!;
        return {
          key,
          payments: sorted,
          isSplit: groupPayments.length > 1,
          totalAmount: groupPayments.reduce((s, p) => s + p.amount, 0),
          totalAmountUsd: groupPayments.reduce((s, p) => s + (p.amountUsd ?? 0), 0),
          primary,
        } satisfies BankPaymentGroup;
      })
      .sort(
        (a, b) => new Date(b.primary.paidAt).getTime() - new Date(a.primary.paidAt).getTime(),
      );
  }, [allBankPayments]);
  const bankPaymentGroups = bankPaymentGroupsAll;

  const submitImport = async () => {
    if (!selectedAccountId || !importFile) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const acc = accounts.find((a) => a.id === selectedAccountId);
      const importPath =
        acc?.provider === "UPC"
          ? null
          : `/api/integrations/privat24/accounts/${selectedAccountId}/import`;
      if (!importPath) {
        pushToast(t.payments.errors.importNotSupported, "error");
        setImporting(false);
        return;
      }
      const r = await fetch(importPath, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!r.ok) throw new Error(await r.text());
      setShowAddStatement(false);
      setSelectedAccountId(null);
      setImportFile(null);
      await fetchUnmatched();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.importFailed, "error");
    } finally {
      setImporting(false);
    }
  };

  const searchOrders = useCallback(async (q: string) => {
    if (!q.trim()) {
      setOrderCandidates([]);
      return;
    }
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?q=${encodeURIComponent(q.trim())}&page=1&pageSize=50&withCompanyClient=true`,
      );
      setOrderCandidates((r.data?.items ?? []).slice(0, 10));
    } catch {
      setOrderCandidates([]);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void searchOrders(orderSearch), 300);
    return () => clearTimeout(t);
  }, [orderSearch, searchOrders]);

  const searchOrdersForEdit = useCallback(async (q: string) => {
    if (!q.trim()) {
      setEditOrderCandidates([]);
      return;
    }
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?q=${encodeURIComponent(q.trim())}&page=1&pageSize=50&withCompanyClient=true`,
      );
      setEditOrderCandidates((r.data?.items ?? []).slice(0, 10));
    } catch {
      setEditOrderCandidates([]);
    }
  }, []);

  useEffect(() => {
    if (!editPayment) return;
    const t = setTimeout(() => void searchOrdersForEdit(editOrderSearch), 300);
    return () => clearTimeout(t);
  }, [editPayment, editOrderSearch, searchOrdersForEdit]);

  const fetchContactsForAddCash = useCallback(async () => {
    setAddCashContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[] }>(
        "/contacts?page=1&pageSize=300",
      );
      setAddCashContacts(r.data?.items ?? []);
    } catch {
      setAddCashContacts([]);
    } finally {
      setAddCashContactsLoading(false);
    }
  }, []);

  const addCashContactCandidates = useMemo(
    () =>
      filterBySearch(
        addCashContacts,
        addCashContactSearch,
        (c) => [c.lastName, c.firstName, c.phone].filter(Boolean).join(" "),
      ).slice(0, 15),
    [addCashContacts, addCashContactSearch],
  );

  const fetchUnpaidOrdersForContact = useCallback(async (contactId: string) => {
    setAddCashOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?partyContactId=${encodeURIComponent(contactId)}&hasDebt=true&page=1&pageSize=100&withCompanyClient=true&sortBy=paymentDueDate&sortDir=asc`,
      );
      const list = (r.data?.items ?? []) as (OrderOption & { debtAmount?: number })[];
      setAddCashOrders(list.filter((o) => Number(o.debtAmount ?? 0) > 0.009));
    } catch {
      setAddCashOrders([]);
    } finally {
      setAddCashOrdersLoading(false);
    }
  }, []);

  const searchContactsForAllocate = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 3) {
      setAllocateContacts([]);
      return;
    }
    setAllocateContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[]; total?: number }>(
        `/contacts?page=1&pageSize=50&q=${encodeURIComponent(term)}`,
      );
      const items = r.data?.items ?? [];
      setAllocateContacts(items);
    } catch {
      setAllocateContacts([]);
    } finally {
      setAllocateContactsLoading(false);
    }
  }, []);

  const fetchUnpaidOrdersForAllocate = useCallback(async (contactId: string) => {
    setAllocateOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?partyContactId=${encodeURIComponent(contactId)}&hasDebt=true&page=1&pageSize=100&withCompanyClient=true&sortBy=paymentDueDate&sortDir=asc`,
      );
      const list = (r.data?.items ?? []) as (OrderOption & { debtAmount?: number })[];
      setAllocateOrders(list.filter((o) => Number((o as { debtAmount?: number }).debtAmount ?? 0) > 0.009));
    } catch {
      setAllocateOrders([]);
    } finally {
      setAllocateOrdersLoading(false);
    }
  }, []);

  const allocateContactCandidates = useMemo(
    () =>
      allocateContactSearch.trim().length >= 3
        ? allocateContacts.slice(0, 15)
        : [],
    [allocateContacts, allocateContactSearch],
  );

  useEffect(() => {
    if (allocateTxId) {
      setAllocateContacts([]);
    }
  }, [allocateTxId]);

  useEffect(() => {
    const q = allocateContactSearch.trim();
    if (q.length < 3) {
      setAllocateContacts([]);
      return;
    }
    const t = setTimeout(() => void searchContactsForAllocate(allocateContactSearch), 300);
    return () => clearTimeout(t);
  }, [allocateContactSearch, searchContactsForAllocate]);

  useEffect(() => {
    if (allocateContactId) void fetchUnpaidOrdersForAllocate(allocateContactId);
  }, [allocateContactId, fetchUnpaidOrdersForAllocate]);

  const searchContactsForEdit = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 3) {
      setEditContacts([]);
      return;
    }
    setEditContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[] }>(
        `/contacts?page=1&pageSize=50&q=${encodeURIComponent(term)}`,
      );
      setEditContacts(r.data?.items ?? []);
    } catch {
      setEditContacts([]);
    } finally {
      setEditContactsLoading(false);
    }
  }, []);

  const fetchOrdersForEdit = useCallback(async (contactId: string) => {
    setEditContactOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?contactId=${encodeURIComponent(contactId)}&page=1&pageSize=100&withCompanyClient=true`,
      );
      const list = (r.data?.items ?? []) as OrderOption[];
      list.sort(
        (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
      );
      setEditContactOrders(list);
    } catch {
      setEditContactOrders([]);
    } finally {
      setEditContactOrdersLoading(false);
    }
  }, []);

  const editContactCandidates = useMemo(
    () => (editContactSearch.trim().length >= 3 ? editContacts.slice(0, 15) : []),
    [editContacts, editContactSearch],
  );

  useEffect(() => {
    if (!editPayment) return;
    const q = editContactSearch.trim();
    if (q.length < 3) {
      setEditContacts([]);
      return;
    }
    const timer = setTimeout(() => void searchContactsForEdit(editContactSearch), 300);
    return () => clearTimeout(timer);
  }, [editPayment, editContactSearch, searchContactsForEdit]);

  useEffect(() => {
    if (editContactId) void fetchOrdersForEdit(editContactId);
  }, [editContactId, fetchOrdersForEdit]);

  const addCashAmountNum = useMemo(() => {
    const num = parseFloat(addCashAmount.replace(/,/g, "."));
    return Number.isFinite(num) && num > 0 ? num : null;
  }, [addCashAmount]);

  const addCashNeedsSplit = useMemo(() => {
    if (!addCashContactId || addCashOrders.length === 0 || addCashAmountNum == null) return false;
    if (addCashOrders.length > 1) return true;
    const order = addCashOrderId
      ? addCashOrders.find((o) => o.id === addCashOrderId)
      : addCashOrders[0];
    if (!order) return false;
    const debt = orderDebtInPaymentCurrency(order, addCashCurrency);
    return addCashAmountNum > debt + 0.01;
  }, [
    addCashContactId,
    addCashOrders,
    addCashAmountNum,
    addCashOrderId,
    addCashCurrency,
  ]);

  useEffect(() => {
    if (!addCashNeedsSplit || addCashAmountNum == null) {
      setAddCashSplitRows([]);
      return;
    }
    setAddCashSplitRows(
      buildSplitRowsFromOrdersFifo(addCashOrders, addCashAmountNum, addCashCurrency),
    );
  }, [addCashNeedsSplit, addCashAmountNum, addCashOrders, addCashCurrency]);

  const addCashSplitTotal = useMemo(
    () =>
      addCashSplitRows.reduce(
        (s, r) => s + (parseFloat(r.amount.replace(/,/g, ".")) || 0),
        0,
      ),
    [addCashSplitRows],
  );

  const addCashSplitValid =
    addCashNeedsSplit &&
    addCashSplitRows.length > 0 &&
    addCashSplitRows.every((r) => r.orderId && parseFloat(r.amount.replace(/,/g, ".")) > 0) &&
    addCashAmountNum != null &&
    Math.abs(addCashSplitTotal - addCashAmountNum) <= 0.01;

  const resetAddCashForm = () => {
    setShowAddCashPayment(false);
    setAddCashContactId(null);
    setAddCashContactName("");
    setAddCashOrderId(null);
    setAddCashOrderNumber("");
    setAddCashOrders([]);
    setAddCashAmount("");
    setAddCashCurrency("UAH");
    setAddCashNote("");
    setAddCashSplitRows([]);
    setAddCashConfirmDuplicate(false);
    addCashIdempotencyKeyRef.current = null;
  };

  const submitAddCashPayment = async (confirmDuplicate = false) => {
    if (addCashSubmitting) return;
    const now = Date.now();
    if (now - addCashLastSubmitAtRef.current < 500) return;
    addCashLastSubmitAtRef.current = now;

    const targetOrderId =
      addCashOrderId ?? (addCashNeedsSplit ? addCashSplitRows[0]?.orderId : null);
    if (!targetOrderId) {
      pushToast(t.payments.errors.selectOrder, "error");
      return;
    }
    const num = addCashAmountNum;
    if (num == null) {
      pushToast(t.payments.errors.positiveAmount, "error");
      return;
    }
    if (addCashNeedsSplit && !addCashSplitValid) {
      pushToast(
        t.payments.errors.splitTotal(
          addCashSplitTotal.toFixed(2),
          num.toFixed(2),
          addCashCurrency,
        ),
        "error",
      );
      return;
    }
    setAddCashSubmitting(true);
    try {
      if (!addCashIdempotencyKeyRef.current) {
        addCashIdempotencyKeyRef.current = crypto.randomUUID();
      }
      const payload: Record<string, unknown> = {
        orderId: targetOrderId,
        amount: num,
        currency: addCashCurrency,
        paidAt: new Date(addCashPaidAt).toISOString(),
        note: addCashNote.trim() || undefined,
        contactId: addCashContactId ?? undefined,
      };
      if (addCashNeedsSplit && addCashSplitRows.length > 0) {
        payload.allocations = addCashSplitRows.map((r) => ({
          orderId: r.orderId,
          amount: parseFloat(r.amount.replace(/,/g, ".")),
        }));
      }
      if (confirmDuplicate || addCashConfirmDuplicate) {
        payload.confirmDuplicate = true;
      }
      await apiHttp.post("/payments/cash", payload, {
        headers: { "Idempotency-Key": addCashIdempotencyKeyRef.current },
      });
      resetAddCashForm();
      await fetchPayments({ bankIdOverride: "" });
    } catch (e) {
      const err = e as { code?: string; status?: number; details?: unknown; message?: string };
      const details = err.details as
        | {
            code?: string;
            message?:
              | string
              | {
                  code?: string;
                  existing?: { orderNumber?: string | null; amount?: number; currency?: string };
                };
            existing?: { orderNumber?: string | null; amount?: number; currency?: string };
          }
        | undefined;
      const nested =
        details && typeof details.message === "object" && details.message !== null
          ? details.message
          : details;
      const dupCode = nested && "code" in nested ? nested.code : details?.code;
      const existing =
        nested && typeof nested === "object" && "existing" in nested
          ? nested.existing
          : details?.existing;
      if (
        err.status === 409 &&
        dupCode === "CASH_PAYMENT_DUPLICATE" &&
        !confirmDuplicate &&
        !addCashConfirmDuplicate
      ) {
        const exLabel = existing
          ? t.payments.cashDuplicateExisting(
              existing.orderNumber ?? "—",
              `${existing.amount?.toFixed(2) ?? "?"} ${existing.currency ?? ""}`,
            )
          : "";
        if (window.confirm(`${t.payments.cashDuplicateConfirm}\n${exLabel}`)) {
          setAddCashConfirmDuplicate(true);
          setAddCashSubmitting(false);
          addCashLastSubmitAtRef.current = 0;
          await submitAddCashPayment(true);
          return;
        }
      } else {
        pushToast(err instanceof Error ? err.message : t.payments.errors.addPaymentFailed, "error");
      }
    } finally {
      setAddCashSubmitting(false);
    }
  };

  const loadSplitClientOrders = useCallback(async (contactId: string) => {
    setSplitClientOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?partyContactId=${encodeURIComponent(contactId)}&page=1&pageSize=100&withCompanyClient=true&sortBy=paymentDueDate&sortDir=asc`,
      );
      setSplitClientOrders(r.data?.items ?? []);
    } catch {
      setSplitClientOrders([]);
    } finally {
      setSplitClientOrdersLoading(false);
    }
  }, []);

  const resetSplitContactState = useCallback(() => {
    setSplitContactId(null);
    setSplitContactName("");
    setSplitContactSearch("");
    setSplitContacts([]);
    setSplitClientOrders([]);
  }, []);

  const searchContactsForSplit = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 3) {
      setSplitContacts([]);
      return;
    }
    setSplitContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[] }>(
        `/contacts?page=1&pageSize=50&q=${encodeURIComponent(term)}`,
      );
      setSplitContacts(r.data?.items ?? []);
    } catch {
      setSplitContacts([]);
    } finally {
      setSplitContactsLoading(false);
    }
  }, []);

  const splitContactCandidates = useMemo(
    () => (splitContactSearch.trim().length >= 3 ? splitContacts.slice(0, 15) : []),
    [splitContacts, splitContactSearch],
  );

  const searchOrdersForSplit = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSplitOrderCandidates([]);
      return;
    }
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?q=${encodeURIComponent(q.trim())}&page=1&pageSize=50&withCompanyClient=true`,
      );
      setSplitOrderCandidates((r.data?.items ?? []).slice(0, 10));
    } catch {
      setSplitOrderCandidates([]);
    }
  }, []);

  useEffect(() => {
    if (!splitTx && !splitFromEditPayment) return;
    const t = setTimeout(() => void searchOrdersForSplit(splitOrderSearch), 300);
    return () => clearTimeout(t);
  }, [splitTx, splitFromEditPayment, splitOrderSearch, searchOrdersForSplit]);

  useEffect(() => {
    if (!splitTx && !splitFromEditPayment) return;
    const q = splitContactSearch.trim();
    if (q.length < 3 || splitContactId) {
      setSplitContacts([]);
      return;
    }
    const timer = setTimeout(() => void searchContactsForSplit(splitContactSearch), 300);
    return () => clearTimeout(timer);
  }, [splitTx, splitFromEditPayment, splitContactSearch, splitContactId, searchContactsForSplit]);

  const closeAllocateModal = useCallback(() => {
    setAllocateTxId(null);
    setAllocateTx(null);
    setAllocateContactSearch("");
    setAllocateContactId(null);
    setAllocateContactName("");
    setAllocateOrders([]);
    setSelectedOrderId(null);
    setAllocateOrderNumber("");
    setOrderSearch("");
  }, []);

  const submitQuickAllocate = async (transactionId: string, orderId: string) => {
    setAllocating(transactionId);
    try {
      await apiHttp.post("/payments/allocate", { transactionId, orderId });
      await refreshQueue({ silent: true });
      void fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.allocationFailed, "error");
    } finally {
      setAllocating(null);
    }
  };

  const submitAllocate = async () => {
    if (!allocateTxId || !selectedOrderId) return;
    setAllocating(allocateTxId);
    try {
      const remaining =
        allocateTx && typeof allocateTx.remainingAmount === "number"
          ? allocateTx.remainingAmount
          : undefined;
      await apiHttp.post("/payments/allocate", {
        transactionId: allocateTxId,
        orderId: selectedOrderId,
        ...(remaining != null && remaining > 0 && remaining < allocateTx!.amount
          ? { amount: remaining }
          : {}),
        matchMeta: { decision: "MANUAL" },
      });
      closeAllocateModal();
      await refreshQueue({ silent: true });
      void fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.allocationFailed, "error");
    } finally {
      setAllocating(null);
    }
  };

  const splitTotalAmount = splitFromEditPayment
    ? splitFromEditPayment.amount
    : splitTx != null
      ? (typeof splitTx.remainingAmount === "number" ? splitTx.remainingAmount : splitTx.amount)
      : 0;
  const splitCurrency = splitFromEditPayment?.currency ?? splitTx?.currency ?? "";

  const openDistributeFromSuggestion = (tx: BankTransaction, sug?: ClientMatchSuggestion) => {
    const top = sug ?? tx.suggestions?.[0];
    resetSplitContactState();
    setSplitTx(tx);
    setSplitOrderSearch("");
    setSplitOrderForRowIndex(null);
    const allocs = top?.proposedAllocations?.length
      ? top.proposedAllocations
      : tx.autoMatchPlan?.allocations;
    if (allocs?.length) {
      const orderMap = new Map(
        (top?.ordersWithDebt ?? []).map((o) => [o.orderId, o.orderNumber]),
      );
      setSplitRows(
        allocs.map((a) => ({
          orderId: a.orderId,
          orderNumber: orderMap.get(a.orderId) ?? a.orderId,
          amount: String(a.amount),
        })),
      );
    } else {
      setSplitRows([{ orderId: "", orderNumber: "", amount: "" }]);
    }
    if (top?.contactId) {
      setSplitContactId(top.contactId);
      setSplitContactName(top.label);
      setSplitContactSearch("");
      void loadSplitClientOrders(top.contactId);
    }
  };

  const submitApplyProposed = async (tx: BankTransaction) => {
    // Only server-eligible auto plans (debt/purpose sum == remaining). Proportional
    // prefill is for the distribute modal, not one-click allocate-split.
    if (!tx.autoMatchEligible || !tx.autoMatchPlan?.allocations?.length) {
      openDistributeFromSuggestion(tx);
      return;
    }
    setAllocating(tx.id);
    try {
      await apiHttp.post(`/bank/transactions/${tx.id}/auto-match`, {});
      await refreshQueue({ silent: true });
      void fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.allocationFailed, "error");
    } finally {
      setAllocating(null);
    }
  };

  const pickSplitOrders = useCallback(() => {
    const unpaid = splitClientOrders.filter((o) => Number(o.debtAmount ?? 0) > 0);
    if (unpaid.length === 0) {
      pushToast(t.payments.noUnpaidOrders, "error");
      return;
    }
    const rows = buildSplitRowsFromOrders(unpaid, splitTotalAmount, splitCurrency || "UAH");
    if (rows.length === 0) {
      pushToast(t.payments.errors.noAmountsSplit, "error");
      return;
    }
    setSplitRows(rows);
    setSplitOrderForRowIndex(null);
    setSplitOrderSearch("");
    setSplitOrderCandidates([]);
  }, [splitClientOrders, splitTotalAmount, splitCurrency, pushToast]);

  const submitSplit = async () => {
    const valid = splitRows.filter((r) => r.orderId && r.amount.trim());
    if (valid.length === 0) {
      pushToast(t.payments.errors.splitNeedOrder, "error");
      return;
    }
    const amounts = valid.map((r) => parseFloat(r.amount.replace(/,/g, ".")));
    if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) {
      pushToast(t.payments.errors.splitPositive, "error");
      return;
    }
    const total = amounts.reduce((s, a) => s + a, 0);
    if (Math.abs(total - splitTotalAmount) > 0.01) {
      pushToast(
        t.payments.errors.splitTotal(
          total.toFixed(2),
          splitTotalAmount.toFixed(2),
          splitCurrency,
        ),
      );
      return;
    }
    setSplitSubmitting(true);
    try {
      if (splitFromEditPayment) {
        await apiHttp.post(`/payments/${splitFromEditPayment.id}/split`, {
          allocations: valid.map((r, i) => ({ orderId: r.orderId, amount: amounts[i] })),
        });
        setSplitFromEditPayment(null);
        resetSplitContactState();
      } else if (splitTx) {
        await apiHttp.post("/payments/allocate-split", {
          transactionId: splitTx.id,
          allocations: valid.map((r, i) => ({ orderId: r.orderId, amount: amounts[i] })),
        });
        setSplitTx(null);
        resetSplitContactState();
        await refreshQueue({ silent: true });
      }
      setSplitRows([]);
      setSplitOrderForRowIndex(null);
      setSplitOrderSearch("");
      void fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.splitFailed, "error");
    } finally {
      setSplitSubmitting(false);
    }
  };

  const openEdit = (p: PaymentItem) => {
    setEditPayment(p);
    setEditAmount(String(p.amount));
    setEditCurrency(p.currency || "UAH");
    setEditAmountUsd(typeof p.amountUsd === "number" ? String(p.amountUsd) : "");
    setEditAmountUsdTouched(false);
    setEditPaidAt(new Date(p.paidAt).toISOString().slice(0, 16));
    setEditNote(p.note ?? "");
    setEditOrderId(p.orderId);
    setEditOrderNumber(p.orderNumber ?? p.orderId);
    setEditOrderSearch("");
    setEditOrderCandidates([]);
    setEditContactSearch("");
    setEditContactId(null);
    setEditContactName("");
    setEditContactOrders([]);
    setEditContacts([]);
  };

  const toggleSplitExpanded = useCallback((key: string) => {
    setExpandedSplitKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const submitEdit = async () => {
    if (!editPayment) return;
    setSavingPayment(true);
    try {
      const payload: {
        amount?: number;
        currency?: string;
        amountUsd?: number;
        paidAt?: string;
        note?: string;
        orderId?: string;
      } = {};
      if (editPayment.sourceType === "CASH") {
        payload.paidAt = new Date(editPaidAt).toISOString();
        const num = parseFloat(editAmount.replace(/,/g, "."));
        if (!Number.isFinite(num) || num <= 0) throw new Error(t.payments.errors.invalidAmount);
        payload.amount = num;
        if (editCurrency.trim()) payload.currency = editCurrency.trim().toUpperCase();
      }
      if (userRole === "ADMIN" && editAmountUsdTouched && editAmountUsd.trim() !== "") {
        const usd = parseFloat(editAmountUsd.replace(/,/g, "."));
        if (Number.isFinite(usd) && usd >= 0) payload.amountUsd = usd;
      }
      payload.note = editNote.trim() || undefined;
      if (editOrderId && editOrderId !== editPayment.orderId) payload.orderId = editOrderId;
      await apiHttp.patch(`/payments/${editPayment.id}`, payload);
      setEditPayment(null);
      await fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.updateFailed, "error");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitDeleteCash = async () => {
    if (!editPayment || editPayment.sourceType !== "CASH" || userRole !== "ADMIN") return;
    const amountLabel = formatPaymentAmount(editPayment);
    const orderLabel = editPayment.orderNumber ?? editPayment.orderId;
    if (!window.confirm(t.payments.deleteCashPaymentConfirm(orderLabel, amountLabel))) return;
    setSavingPayment(true);
    try {
      await apiHttp.delete(`/payments/${editPayment.id}`);
      setEditPayment(null);
      await fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.updateFailed, "error");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitUnallocate = async () => {
    if (!editPayment) return;
    if (editPayment.sourceType !== "BANK") return;
    setSavingPayment(true);
    try {
      await apiHttp.delete(`/payments/${editPayment.id}/allocation`);
      setEditPayment(null);
      await fetchUnmatched();
      await fetchPayments();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : t.payments.errors.unallocateFailed, "error");
    } finally {
      setSavingPayment(false);
    }
  };

  const loading =
    mode === "cash"
      ? paymentsLoading
      : mode === "fop" && (view === "unmatched" || view === "ignored")
        ? unmatchedLoading
        : mode === "fop" && view === "fxVariance"
          ? fxQueueLoading
          : paymentsLoading;

  const fxQueueFiltered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return fxQueue;
    return fxQueue.filter((row) => {
      const contact =
        row.contact != null
          ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
          : row.client != null
            ? `${row.client.firstName} ${row.client.lastName}`.trim()
            : row.company?.name ?? "";
      return (
        row.orderNumber.toLowerCase().includes(q) ||
        contact.toLowerCase().includes(q)
      );
    });
  }, [fxQueue, debouncedSearch]);

  return (
    <div className="space-y-4">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl font-bold text-zinc-900">{t.payments.pageTitle}</h1>
            <HelpHint routeKey="payments" />
            <div className="flex rounded-lg border border-zinc-200 p-0.5">
              <button
                type="button"
                onClick={() => setMode("cash")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "cash" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {t.payments.cash}
              </button>
              <button
                type="button"
                onClick={() => setMode("fop")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "fop" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                {t.payments.fop}
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-zinc-500">{t.payments.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {oneCPaymentsEnabled && (
            <Link
              href="/settings/integrations/1c-payments"
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              {t.payments.uploadOneCPayments}
            </Link>
          )}
          {mode === "cash" && (
            <button
              type="button"
              onClick={() => {
                setShowAddCashPayment(true);
                setAddCashPaidAt(new Date().toISOString().slice(0, 16));
                setAddCashContactSearch("");
                setAddCashContactId(null);
                setAddCashContactName("");
                setAddCashOrders([]);
                setAddCashOrderId(null);
                setAddCashOrderNumber("");
                setAddCashAmount("");
                setAddCashCurrency("UAH");
                setAddCashNote("");
                void fetchContactsForAddCash();
              }}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              {t.payments.addPayment}
            </button>
          )}
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {mode === "fop" && (
              <>
                <div className="flex rounded-lg border border-zinc-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewWithUrl("payments")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "payments"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {t.payments.allocatedTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewWithUrl("unmatched")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "unmatched"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {t.payments.toAllocateTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewWithUrl("ignored")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "ignored"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {t.payments.ignoredTab}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewWithUrl("fxVariance")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "fxVariance"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    {t.payments.fxVariance.tab}
                    {fxSummaryCount > 0 ? (
                      <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                        {fxSummaryCount}
                      </span>
                    ) : null}
                  </button>
                </div>
                {view !== "fxVariance" && (
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  {t.payments.bankAccountLabel}
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="">{t.payments.allAccountsOption}</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </label>
                )}
              </>
            )}
            {(mode === "cash" || view !== "fxVariance") && (
              <>
                <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                  <span className="whitespace-nowrap">{t.payments.dateFromLabel}</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1.5 text-sm text-zinc-600">
                  <span className="whitespace-nowrap">{t.payments.dateToLabel}</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </label>
              </>
            )}
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t.payments.searchPlaceholder}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none w-56"
            />
          </div>
        </div>

        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        {loading && <p className="px-4 py-6 text-sm text-zinc-500">{t.common.loading}</p>}

        {!loading && mode === "cash" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{t.payments.date}</th>
                  <th className="px-4 py-3">{t.payments.order}</th>
                  <th className="px-4 py-3">{t.payments.orderClient}</th>
                  <th className="px-4 py-3">{t.payments.source}</th>
                  <th className="px-4 py-3">{t.payments.fopCol}</th>
                  <th className="px-4 py-3 text-right">{t.payments.amount}</th>
                  <th className="px-4 py-3">{t.payments.counterparty}</th>
                  <th className="px-4 py-3 w-24">{t.payments.action}</th>
                </tr>
              </thead>
              <tbody>
                {cashPayments.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">
                      {formatDate(p.paidAt)}
                    </td>
                    <td className="px-4 py-3">
                      {p.orderNumber ? (
                        <Link
                          href={`/orders?orderId=${p.orderId}`}
                          className="font-medium text-zinc-900 hover:underline"
                        >
                          {p.orderNumber}
                        </Link>
                      ) : (
                        p.orderId
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-[14rem] truncate text-zinc-700" title={p.contactLabel ?? ""}>
                      {p.contactLabel?.trim() ? p.contactLabel : t.payments.dash}
                    </td>
                    <td className="px-4 py-3">{t.payments.sourceCash}</td>
                    <td className="px-4 py-3">{t.payments.dash}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatPaymentAmount(p)}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{p.note ?? t.payments.dash}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        {t.payments.edit}
                      </button>
                    </td>
                  </tr>
                ))}
                {cashPayments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                      {t.payments.noCashPayments}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {paymentsLoadingMore && (
              <p className="px-4 py-3 text-center text-sm text-zinc-500">{t.common.loading}</p>
            )}
            <InfiniteScrollSentinel
              onVisible={loadMorePayments}
              disabled={paymentsLoading || paymentsLoadingMore || !paymentsHasMore}
            />
          </div>
        )}

        {!loading && mode === "fop" && view === "payments" && (
          <>
            <p className="px-4 py-2 text-sm text-zinc-600">
              {t.payments.bankLinkedIntro(bankPaymentGroups.length)}
              {debouncedSearch.trim() ? t.payments.bankLinkedSearch(debouncedSearch.trim()) : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">{t.payments.date}</th>
                    <th className="px-4 py-3">{t.payments.order}</th>
                    <th className="px-4 py-3">{t.payments.orderClient}</th>
                    <th className="px-4 py-3">{t.payments.source}</th>
                    <th className="px-4 py-3">{t.payments.fopCol}</th>
                    <th className="px-4 py-3 text-right">{t.payments.amount}</th>
                    <th className="px-4 py-3">{t.payments.counterparty}</th>
                    <th className="px-4 py-3 w-24">{t.payments.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {bankPaymentGroups.map((group) => {
                    if (!group.isSplit) {
                      const p = group.primary;
                      return (
                        <tr
                          key={group.key}
                          className="border-t border-zinc-100 hover:bg-zinc-50"
                        >
                          <td className="px-4 py-3 text-zinc-600">
                            {p.paidAt ? formatDate(p.paidAt) : t.payments.dash}
                          </td>
                          <td className="px-4 py-3">
                            {p.orderNumber ? (
                              <Link
                                href={`/orders?orderId=${p.orderId}`}
                                className="font-medium text-zinc-900 hover:underline"
                              >
                                {p.orderNumber}
                              </Link>
                            ) : (
                              p.orderId
                            )}
                          </td>
                          <td
                            className="px-4 py-3 max-w-[14rem] truncate text-zinc-700"
                            title={p.contactLabel ?? ""}
                          >
                            {p.contactLabel?.trim() ? p.contactLabel : t.payments.dash}
                          </td>
                          <td className="px-4 py-3">{t.payments.bankKind}</td>
                          <td className="px-4 py-3">
                            {p.bankTransaction?.bankAccount?.name ?? t.payments.dash}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatPaymentAmount(p)}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate">
                            {p.bankTransaction?.counterpartyName ?? p.note ?? t.payments.dash}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                            >
                              {t.payments.edit}
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const p = group.primary;
                    const expanded = expandedSplitKeys.has(group.key);
                    return (
                      <Fragment key={group.key}>
                        <tr className="border-t border-zinc-100 hover:bg-zinc-50">
                          <td className="px-4 py-3 text-zinc-600">
                            {p.paidAt ? formatDate(p.paidAt) : t.payments.dash}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => toggleSplitExpanded(group.key)}
                              className="inline-flex items-center gap-1.5 text-left text-zinc-700 hover:text-zinc-900"
                              aria-expanded={expanded}
                              aria-label={
                                expanded ? t.payments.collapseOrders : t.payments.expandOrders
                              }
                            >
                              <svg
                                className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 9l-7 7-7-7"
                                />
                              </svg>
                              <span>{t.payments.ordersCount(group.payments.length)}</span>
                            </button>
                          </td>
                          <td
                            className="px-4 py-3 max-w-[14rem] truncate text-zinc-700"
                            title={getGroupContactLabel(group)}
                          >
                            {getGroupContactLabel(group)}
                          </td>
                          <td className="px-4 py-3">{t.payments.bankKind}</td>
                          <td className="px-4 py-3">
                            {p.bankTransaction?.bankAccount?.name ?? t.payments.dash}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatPaymentAmount({
                              amount: group.totalAmount,
                              currency: p.currency,
                              amountUsd: group.totalAmountUsd,
                            })}
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate">
                            <div>
                              {p.bankTransaction?.counterpartyName ?? p.note ?? t.payments.dash}
                            </div>
                            {p.bankTransaction?.matchStatus === "AUTO_MATCHED" ? (
                              <div className="text-xs text-emerald-700">
                                {group.isSplit
                                  ? t.payments.autoMatchMultiOrder
                                  : t.payments.autoMatchOrderNumber}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(p)}
                              className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                            >
                              {t.payments.edit}
                            </button>
                          </td>
                        </tr>
                        {expanded &&
                          group.payments.map((child) => (
                            <tr
                              key={`${group.key}-${child.id}`}
                              className="border-t border-zinc-50 bg-zinc-50/60"
                            >
                              <td className="px-4 py-2 text-zinc-400">{t.payments.dash}</td>
                              <td className="px-4 py-2 pl-10">
                                {child.orderNumber ? (
                                  <Link
                                    href={`/orders?orderId=${child.orderId}`}
                                    className="font-medium text-zinc-800 hover:underline"
                                  >
                                    {child.orderNumber}
                                  </Link>
                                ) : (
                                  child.orderId
                                )}
                              </td>
                              <td
                                className="px-4 py-2 max-w-[14rem] truncate text-zinc-600"
                                title={child.contactLabel ?? ""}
                              >
                                {child.contactLabel?.trim() ? child.contactLabel : t.payments.dash}
                              </td>
                              <td className="px-4 py-2 text-zinc-400">{t.payments.dash}</td>
                              <td className="px-4 py-2 text-zinc-400">{t.payments.dash}</td>
                              <td className="px-4 py-2 text-right font-medium text-zinc-700">
                                {formatPaymentAmount(child)}
                              </td>
                              <td className="px-4 py-2 text-zinc-400">{t.payments.dash}</td>
                              <td className="px-4 py-2" />
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                  {bankPaymentGroups.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-zinc-500">
                        {debouncedSearch.trim()
                          ? t.payments.noBankMatchSearch
                          : t.payments.noBankPayments}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {paymentsLoadingMore && (
              <p className="px-4 py-3 text-center text-sm text-zinc-500">{t.common.loading}</p>
            )}
            <InfiniteScrollSentinel
              onVisible={loadMorePayments}
              disabled={paymentsLoading || paymentsLoadingMore || !paymentsHasMore}
            />

          </>
        )}

        {!loading && mode === "fop" && view === "fxVariance" && (
          <div className="overflow-x-auto">
            <p className="px-4 py-3 text-sm text-zinc-600">
              {t.payments.fxVariance.intro(fxQueueTotal)}
            </p>
            {fxQueueFiltered.length === 0 ? (
              <p className="px-4 pb-6 text-sm text-zinc-500">{t.payments.fxVariance.empty}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">{t.payments.order}</th>
                    <th className="px-4 py-3">{t.payments.orderClient}</th>
                    <th className="px-4 py-3 text-right">{t.payments.fxVariance.total}</th>
                    <th className="px-4 py-3 text-right">{t.payments.fxVariance.paidUahCol}</th>
                    <th className="px-4 py-3 text-right">{t.payments.fxVariance.paidUsdCol}</th>
                    <th className="px-4 py-3 text-right">{t.payments.fxVariance.debtUsd}</th>
                    <th className="px-4 py-3 text-right">{t.payments.fxVariance.residualUah}</th>
                    <th className="px-4 py-3">{t.payments.fxVariance.stage}</th>
                    <th className="px-4 py-3 w-28">{t.payments.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {fxQueueFiltered.map((row) => {
                    const contactLabel =
                      row.contact != null
                        ? `${row.contact.firstName} ${row.contact.lastName}`.trim()
                        : row.client != null
                          ? `${row.client.firstName} ${row.client.lastName}`.trim()
                          : row.company?.name ?? "—";
                    const effectiveTotal =
                      row.totalAmount - (row.returnAdjustmentAmount ?? 0);
                    const stageKey = row.orderStage ?? "";
                    const stageLabel =
                      t.planning.orderStages[
                        stageKey as keyof typeof t.planning.orderStages
                      ] ?? stageKey;
                    return (
                      <tr key={row.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/orders?orderId=${row.id}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {row.orderNumber}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{contactLabel}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatOrderAmount(
                            effectiveTotal,
                            row.currency,
                            row.exchangeRate,
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {Math.round(row.fxVariance.paidUah)} ₴
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {row.fxVariance.paidUsd.toFixed(2)} {row.currency}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-amber-800">
                          {row.fxVariance.debtUsd.toFixed(2)} {row.currency}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                          {Math.round(row.fxVariance.residualUah)} ₴
                        </td>
                        <td className="px-4 py-3 text-zinc-600">{stageLabel}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setFxWriteOffOrder(row)}
                            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800"
                          >
                            {t.payments.fxVariance.writeOff}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!loading && mode === "fop" && view === "unmatched" && (
          <div className="overflow-x-auto">
            <p className="px-4 py-2 text-sm text-zinc-600">
              {t.payments.unmatchedIntro(unmatchedTotal || unmatched.length)}
            </p>
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{t.payments.date}</th>
                  <th className="px-4 py-3">{t.payments.fopCol}</th>
                  <th className="px-4 py-3 text-right">{t.payments.amount}</th>
                  <th className="px-4 py-3">{t.payments.description}</th>
                  <th className="px-4 py-3">{t.payments.likelyClient}</th>
                  <th className="px-4 py-3">{t.payments.counterparty}</th>
                  <th className="px-4 py-3 w-36">{t.payments.action}</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((tx) => {
                  const topSug = tx.suggestions?.[0];
                  const foundOrders = tx.parsedOrders?.found?.map((o) => o.orderNumber) ?? [];
                  const remaining =
                    typeof tx.remainingAmount === "number" ? tx.remainingAmount : tx.amount;
                  const isPartial =
                    (tx.allocatedAmount ?? 0) > 0.01 && remaining > 0.01;
                  return (
                  <tr key={tx.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">
                      {formatDate(tx.bookedAt)}
                    </td>
                    <td className="px-4 py-3">{tx.bankAccount?.name ?? tx.bankAccountId}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      <div>+{tx.amount.toFixed(2)} {tx.currency}</div>
                      {isPartial ? (
                        <div className="text-xs font-normal text-amber-700">
                          {t.payments.remainingAmount(remaining.toFixed(2), tx.currency)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 max-w-xs" title={tx.description ?? ""}>
                      <div className="truncate">{tx.description ?? t.payments.dash}</div>
                      {foundOrders.length > 0 ? (
                        <div className="mt-1 text-xs text-sky-800">
                          {t.payments.foundOrdersBadge(foundOrders.join(", "))}
                        </div>
                      ) : null}
                      {tx.parsedDocuments?.matchedInvoiceNumber ||
                      tx.parsedDocuments?.matchedWaybillNumber ||
                      topSug?.matchedInvoiceNumber ||
                      topSug?.matchedWaybillNumber ? (
                        <div className="mt-1 text-xs text-violet-800">
                          {topSug?.matchedInvoiceNumber || tx.parsedDocuments?.matchedInvoiceNumber
                            ? t.payments.invoiceLabel(
                                topSug?.matchedInvoiceNumber ||
                                  tx.parsedDocuments?.matchedInvoiceNumber ||
                                  "",
                              )
                            : null}
                          {topSug?.matchedWaybillNumber || tx.parsedDocuments?.matchedWaybillNumber
                            ? ` · ${t.payments.waybillLabel(
                                topSug?.matchedWaybillNumber ||
                                  tx.parsedDocuments?.matchedWaybillNumber ||
                                  "",
                              )}`
                            : null}
                        </div>
                      ) : null}
                      {tx.suggestion && !topSug ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-emerald-800">
                          <span>
                            {t.payments.possibleMatch(
                              tx.suggestion.orderNumber,
                              tx.suggestion.contactLabel || t.payments.dash,
                              tx.suggestion.debtAmount.toFixed(2),
                              (tx.suggestion.expectedAmountUah ?? tx.amount).toFixed(2),
                            )}
                          </span>
                          <button
                            type="button"
                            disabled={allocating === tx.id}
                            onClick={() =>
                              void submitQuickAllocate(tx.id, tx.suggestion!.orderId)
                            }
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium hover:bg-emerald-100 disabled:opacity-50"
                          >
                            {allocating === tx.id
                              ? t.payments.allocating
                              : t.payments.linkSuggestion}
                          </button>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {topSug ? (
                        <div className="space-y-1">
                          <div className="font-medium text-zinc-800">{topSug.label}</div>
                          <div className="text-zinc-500">
                            {t.payments.scoreLabel(topSug.score)}
                            {topSug.reasons?.length
                              ? ` · ${topSug.reasons.map(reasonLabel).join(", ")}`
                              : ""}
                          </div>
                          {topSug.warnings?.includes("different_clients") ? (
                            <div className="text-amber-700">{t.payments.warningDifferentClients}</div>
                          ) : null}
                          {topSug.warnings?.includes("amount_mismatch") ? (
                            <div className="text-amber-700">{t.payments.warningAmountMismatch}</div>
                          ) : null}
                          {tx.autoMatchEligible ? (
                            <button
                              type="button"
                              disabled={allocating === tx.id}
                              onClick={() => void submitApplyProposed(tx)}
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {allocating === tx.id
                                ? t.payments.allocating
                                : t.payments.applyProposed}
                            </button>
                          ) : topSug.ordersWithDebt[0] ? (
                            <button
                              type="button"
                              disabled={allocating === tx.id}
                              onClick={() =>
                                void submitQuickAllocate(tx.id, topSug.ordersWithDebt[0]!.orderId)
                              }
                              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {allocating === tx.id
                                ? t.payments.allocating
                                : t.payments.linkSuggestion}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        t.payments.dash
                      )}
                    </td>
                    <td className="px-4 py-3">{tx.counterpartyName ?? t.payments.dash}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAllocateTxId(tx.id);
                            setAllocateTx(tx);
                            setAllocateContactSearch("");
                            setOrderSearch("");
                            if (topSug?.contactId) {
                              setAllocateContactId(topSug.contactId);
                              setAllocateContactName(topSug.label);
                              setAllocateOrders([]);
                              const first = topSug.ordersWithDebt[0];
                              setSelectedOrderId(first?.orderId ?? null);
                              setAllocateOrderNumber(first?.orderNumber ?? "");
                              void fetchUnpaidOrdersForAllocate(topSug.contactId);
                            } else {
                              setAllocateContactId(null);
                              setAllocateContactName("");
                              setAllocateOrders([]);
                              setSelectedOrderId(null);
                              setAllocateOrderNumber("");
                            }
                          }}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          {isPartial ? t.payments.allocateRemaining : t.payments.allocateToOrder}
                        </button>
                        <button
                          type="button"
                          onClick={() => openDistributeFromSuggestion(tx, topSug)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          {t.payments.distribute}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIgnoreTxId(tx.id);
                            setIgnoreCategory("OTHER_EXPENSE");
                          }}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100"
                        >
                          {t.payments.notClient}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {unmatched.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                      {t.payments.noUnmatched}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {unmatchedLoadingMore && (
              <p className="px-4 py-3 text-center text-sm text-zinc-500">{t.common.loading}</p>
            )}
            <InfiniteScrollSentinel
              onVisible={loadMoreUnmatched}
              disabled={unmatchedLoading || unmatchedLoadingMore || !unmatchedHasMore}
            />
          </div>
        )}

        {!loading && mode === "fop" && view === "ignored" && (
          <div className="overflow-x-auto">
            <p className="px-4 py-2 text-sm text-zinc-600">
              {t.payments.ignoredIntro(unmatchedTotal || unmatched.length)}
            </p>
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">{t.payments.date}</th>
                  <th className="px-4 py-3">{t.payments.fopCol}</th>
                  <th className="px-4 py-3 text-right">{t.payments.amount}</th>
                  <th className="px-4 py-3">{t.payments.description}</th>
                  <th className="px-4 py-3">{t.payments.counterparty}</th>
                  <th className="px-4 py-3">{t.payments.ignoreCategoryLabel}</th>
                  <th className="px-4 py-3 w-36">{t.payments.action}</th>
                </tr>
              </thead>
              <tbody>
                {unmatched.map((tx) => {
                  const cat = tx.ignoreCategory as IgnoreCategoryKey | null | undefined;
                  const catLabel =
                    cat && cat in t.payments.ignoreCategories
                      ? t.payments.ignoreCategories[cat]
                      : (tx.ignoreCategory ?? t.payments.dash);
                  const sign = tx.direction === "OUT" ? "−" : "+";
                  return (
                    <tr key={tx.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3 text-zinc-600">{formatDate(tx.bookedAt)}</td>
                      <td className="px-4 py-3">{tx.bankAccount?.name ?? tx.bankAccountId}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {sign}
                        {tx.amount.toFixed(2)} {tx.currency}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={tx.description ?? ""}>
                        {tx.description ?? t.payments.dash}
                      </td>
                      <td className="px-4 py-3">{tx.counterpartyName ?? t.payments.dash}</td>
                      <td className="px-4 py-3 text-xs text-zinc-600">
                        <div>{catLabel}</div>
                        <div className="text-zinc-400">
                          {tx.matchStatus === "TECHNICAL"
                            ? "auto"
                            : tx.ignoreSource === "MANUAL"
                              ? "manual"
                              : (tx.ignoreSource ?? "")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={ignoring === tx.id}
                          onClick={() => void submitUnignore(tx.id)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {ignoring === tx.id ? t.common.loading : t.payments.restoreToQueue}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {unmatched.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                      {t.payments.noIgnored}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {unmatchedLoadingMore && (
              <p className="px-4 py-3 text-center text-sm text-zinc-500">{t.common.loading}</p>
            )}
            <InfiniteScrollSentinel
              onVisible={loadMoreUnmatched}
              disabled={unmatchedLoading || unmatchedLoadingMore || !unmatchedHasMore}
            />
          </div>
        )}

        {!loading && mode === "cash" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {t.payments.cashCount(
              cashPayments.length,
              paymentsTotal,
              !!debouncedSearch.trim(),
            )}
          </p>
        )}
        {!loading && mode === "fop" && view === "payments" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {t.payments.bankCount(
              bankPaymentGroups.length,
              paymentsTotal,
              !!debouncedSearch.trim(),
            )}
          </p>
        )}
        {!loading && mode === "fop" && view === "unmatched" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {t.payments.unmatchedCount(
              unmatched.length,
              unmatchedTotal || unmatched.length,
              !!debouncedSearch.trim(),
            )}
          </p>
        )}
        {!loading && mode === "fop" && view === "ignored" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {t.payments.ignoredIntro(unmatchedTotal || unmatched.length)}
          </p>
        )}
      </section>

      {ignoreTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">{t.payments.notClient}</h3>
            <p className="mt-1 text-sm text-zinc-500">{t.payments.ignoreCategoryLabel}</p>
            <select
              value={ignoreCategory}
              onChange={(e) => setIgnoreCategory(e.target.value as IgnoreCategoryKey)}
              className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              {IGNORE_CATEGORY_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t.payments.ignoreCategories[key]}
                </option>
              ))}
            </select>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIgnoreTxId(null)}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={!!ignoring}
                onClick={() => void submitIgnore()}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {ignoring ? t.common.loading : t.payments.notClient}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddCashPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">{t.payments.addCashTitle}</h3>
            <div className="mt-4 space-y-3">
              <div className="relative">
                <input
                  type="text"
                  value={addCashContactId ? addCashContactName : addCashContactSearch}
                  onChange={(e) => {
                    if (addCashContactId) {
                      setAddCashContactId(null);
                      setAddCashContactName("");
                      setAddCashOrders([]);
                      setAddCashOrderId(null);
                      setAddCashOrderNumber("");
                      setAddCashContactSearch(e.target.value);
                    } else {
                      setAddCashContactSearch(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (addCashContactId) {
                      setAddCashContactSearch(addCashContactName);
                      setAddCashContactId(null);
                      setAddCashContactName("");
                      setAddCashOrders([]);
                      setAddCashOrderId(null);
                      setAddCashOrderNumber("");
                    }
                  }}
                  placeholder={t.payments.addCashContactPh}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                {addCashContactSearch.trim().length >= 3 && addCashContactCandidates.length > 0 && !addCashContactId && (
                  <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
                    {addCashContactCandidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAddCashContactId(c.id);
                            setAddCashContactName([c.lastName, c.firstName].filter(Boolean).join(" ") || c.phone);
                            setAddCashContactSearch("");
                            setAddCashOrderId(null);
                            setAddCashOrderNumber("");
                            void fetchUnpaidOrdersForContact(c.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          {[c.lastName, c.firstName].filter(Boolean).join(" ")} {c.phone ? `· ${formatPhoneDisplay(c.phone)}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {addCashContactId && (
                <div>
                  {addCashOrdersLoading ? (
                    <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      {t.payments.loadingOrders}
                    </div>
                  ) : addCashOrders.length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      {t.payments.noUnpaidOrders}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        readOnly
                        value={addCashOrderId ? addCashOrderNumber : ""}
                        onClick={() => setAddCashOrderId(null)}
                        placeholder={t.payments.selectOrderBelow}
                        className="w-full cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 read-only:bg-zinc-50"
                      />
                      <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 py-1">
                        {addCashOrders.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setAddCashOrderId(o.id);
                                setAddCashOrderNumber(o.orderNumber);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 ${
                                addCashOrderId === o.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700"
                              }`}
                            >
                              {o.orderNumber}
                              {formatOrderOptionAmounts(o, addCashCurrency)}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => {
                          setAddCashContactId(null);
                          setAddCashContactName("");
                          setAddCashOrders([]);
                          setAddCashOrderId(null);
                          setAddCashOrderNumber("");
                        }}
                        className="mt-1 text-xs text-zinc-500 underline hover:text-zinc-700"
                      >
                        {t.payments.changeContact}
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={addCashAmount}
                  onChange={(e) => setAddCashAmount(e.target.value)}
                  placeholder={t.payments.amountPlaceholder}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                <div className="flex rounded-lg border border-zinc-200 p-0.5">
                  {(["UAH", "USD", "EUR"] as const).map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setAddCashCurrency(code)}
                      className={`rounded-md px-2.5 py-1.5 text-sm font-medium ${
                        addCashCurrency === code
                          ? "bg-zinc-900 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                      title={code === "UAH" ? "UAH" : code === "USD" ? "USD" : "EUR"}
                    >
                      {code === "UAH" ? "₴" : code === "USD" ? "$" : "€"}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="datetime-local"
                value={addCashPaidAt}
                onChange={(e) => setAddCashPaidAt(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
              <input
                type="text"
                value={addCashNote}
                onChange={(e) => setAddCashNote(e.target.value)}
                placeholder={t.payments.noteOptional}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              {addCashNeedsSplit && addCashSplitRows.length > 0 && (
                <div className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-xs font-medium text-zinc-600">{t.payments.cashSplitHint}</p>
                  <div className="mt-2 space-y-2">
                    {addCashSplitRows.map((row, idx) => (
                      <div key={row.orderId || idx} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                          {row.orderNumber}
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) =>
                            setAddCashSplitRows((prev) => {
                              const next = [...prev];
                              next[idx] = { ...next[idx]!, amount: e.target.value };
                              return next;
                            })
                          }
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-600">
                    {t.payments.totalProgress(
                      addCashCurrency,
                      addCashSplitTotal.toFixed(2),
                      (addCashAmountNum ?? 0).toFixed(2),
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (addCashSubmitting) return;
                  resetAddCashForm();
                }}
                disabled={addCashSubmitting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => void submitAddCashPayment()}
                disabled={
                  addCashSubmitting ||
                  addCashAmountNum == null ||
                  (!addCashNeedsSplit && !addCashOrderId) ||
                  (addCashNeedsSplit && !addCashSplitValid)
                }
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {addCashSubmitting ? t.payments.saving : t.payments.addPaymentSubmit}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900">{t.payments.addStatementShort}</h3>
            <p className="mt-1 text-xs text-zinc-500">{t.payments.addStatementCsvHint}</p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">{t.payments.bankAccountLabel}</label>
                <select
                  value={selectedAccountId ?? ""}
                  onChange={(e) => setSelectedAccountId(e.target.value || null)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">{t.payments.selectAccount}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{t.payments.csvFile}</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddStatement(false);
                  setSelectedAccountId(null);
                  setImportFile(null);
                }}
                disabled={importing}
                className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => void submitImport()}
                disabled={!selectedAccountId || !importFile || importing}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {importing ? t.payments.importing : t.payments.import}
              </button>
            </div>
          </div>
        </div>
      )}

      {allocateTxId && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="my-auto max-h-[min(90vh,100%)] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">{t.payments.allocateModalTitle}</h3>
            <p className="mt-1 text-sm text-zinc-500">{t.payments.allocateModalHint}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500">{t.payments.contact}</label>
                <input
                  type="text"
                  value={allocateContactId ? allocateContactName : allocateContactSearch}
                  onChange={(e) => {
                    if (allocateContactId) {
                      setAllocateContactId(null);
                      setAllocateContactName("");
                      setAllocateOrders([]);
                      setSelectedOrderId(null);
                      setAllocateOrderNumber("");
                      setAllocateContactSearch(e.target.value);
                    } else {
                      setAllocateContactSearch(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (allocateContactId) {
                      setAllocateContactId(null);
                      setAllocateContactName("");
                      setAllocateOrders([]);
                      setSelectedOrderId(null);
                      setAllocateOrderNumber("");
                      setAllocateContactSearch(allocateContactName);
                    }
                  }}
                  placeholder={t.payments.contactSearchPlaceholder}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                {allocateContactSearch.trim().length >= 3 && allocateContactsLoading && (
                  <div className="mt-1 py-2 text-sm text-zinc-500">{t.payments.searching}</div>
                )}
                {allocateContactCandidates.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-white py-1">
                    {allocateContactCandidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAllocateContactId(c.id);
                            setAllocateContactName([c.lastName, c.firstName].filter(Boolean).join(" ") || c.phone);
                            setAllocateContactSearch("");
                            setSelectedOrderId(null);
                            setAllocateOrderNumber("");
                            void fetchUnpaidOrdersForAllocate(c.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          {[c.lastName, c.firstName].filter(Boolean).join(" ")} {c.phone ? `· ${formatPhoneDisplay(c.phone)}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {allocateContactId && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500">{t.payments.orderUnpaid}</label>
                  {allocateOrdersLoading ? (
                    <div className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      {t.payments.loadingOrders}
                    </div>
                  ) : allocateOrders.length === 0 ? (
                    <div className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      {t.payments.noUnpaidOrders}
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        readOnly
                        value={selectedOrderId ? allocateOrderNumber : ""}
                        onClick={() => {
                          setSelectedOrderId(null);
                          setAllocateOrderNumber("");
                        }}
                        placeholder={t.payments.selectOrderBelow}
                        className="mt-1 w-full cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 read-only:bg-zinc-50"
                      />
                      <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 py-1">
                        {allocateOrders.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(o.id);
                                setAllocateOrderNumber(o.orderNumber ?? o.id);
                              }}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-100 ${
                                selectedOrderId === o.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700"
                              }`}
                            >
                              {o.orderNumber}
                              {formatOrderOptionAmounts(o, allocateTx?.currency ?? "UAH")}
                            </button>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => {
                          setAllocateContactId(null);
                          setAllocateContactName("");
                          setAllocateOrders([]);
                          setSelectedOrderId(null);
                          setAllocateOrderNumber("");
                        }}
                        className="mt-1 text-xs text-zinc-500 underline hover:text-zinc-700"
                      >
                        {t.payments.changeContact}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  const cid = allocateContactId;
                  if (allocateTx) {
                    setSplitTx(allocateTx);
                    setSplitRows([{ orderId: "", orderNumber: "", amount: "" }]);
                    setSplitOrderSearch("");
                    setSplitOrderForRowIndex(null);
                    if (cid) {
                      setSplitContactId(cid);
                      setSplitContactName(allocateContactName);
                      setSplitContactSearch("");
                      void loadSplitClientOrders(cid);
                    } else {
                      resetSplitContactState();
                    }
                  }
                  closeAllocateModal();
                }}
                disabled={!!allocating}
                className="text-sm text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
              >
                {t.payments.distributeAcrossOrders}
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeAllocateModal}
                  disabled={!!allocating}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void submitAllocate()}
                  disabled={!selectedOrderId || !!allocating}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {allocating ? t.payments.allocating : t.payments.allocate}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(splitTx || splitFromEditPayment) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="my-auto max-h-[min(90vh,100%)] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">{t.payments.distributeModalTitle}</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {t.payments.distributeModalHint(
                splitFromEditPayment ? t.payments.kindPayment : t.payments.kindTransaction,
                splitTotalAmount.toFixed(2),
                splitCurrency,
              )}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500">{t.payments.contact}</label>
                <input
                  type="text"
                  value={splitContactId ? splitContactName : splitContactSearch}
                  onChange={(e) => {
                    if (splitContactId) {
                      resetSplitContactState();
                      setSplitContactSearch(e.target.value);
                    } else {
                      setSplitContactSearch(e.target.value);
                    }
                  }}
                  onFocus={() => {
                    if (splitContactId) {
                      const name = splitContactName;
                      resetSplitContactState();
                      setSplitContactSearch(name);
                    }
                  }}
                  placeholder={t.payments.contactSearchPlaceholder}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                {splitContactSearch.trim().length >= 3 && splitContactsLoading && (
                  <p className="mt-1 text-xs text-zinc-500">{t.payments.searching}</p>
                )}
                {splitContactCandidates.length > 0 && !splitContactId && (
                  <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-white py-1">
                    {splitContactCandidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitContactId(c.id);
                            setSplitContactName(
                              [c.lastName, c.firstName].filter(Boolean).join(" ") || c.phone,
                            );
                            setSplitContactSearch("");
                            void loadSplitClientOrders(c.id);
                          }}
                          className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          {[c.lastName, c.firstName].filter(Boolean).join(" ")}{" "}
                          {c.phone ? `· ${formatPhoneDisplay(c.phone)}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {splitContactId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {splitClientOrdersLoading ? (
                      <p className="text-xs text-zinc-500">{t.payments.loadingClientOrders}</p>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={pickSplitOrders}
                          disabled={
                            splitClientOrders.filter((o) => Number(o.debtAmount ?? 0) > 0).length ===
                            0
                          }
                          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {t.payments.pickOrders}
                        </button>
                        <button
                          type="button"
                          onClick={resetSplitContactState}
                          className="text-xs text-zinc-500 underline hover:text-zinc-700"
                        >
                          {t.payments.changeContact}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {splitRows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-2">
                  <div className="min-w-0 flex-1">
                    {splitOrderForRowIndex === idx ? (
                      <>
                        {splitContactId && (
                          <div className="mb-2">
                            {splitClientOrdersLoading ? (
                              <p className="text-xs text-zinc-500">{t.payments.loadingClientOrders}</p>
                            ) : splitClientOrders.length > 0 ? (
                              <>
                                <p className="mb-1 text-xs font-medium text-zinc-500">
                                  {t.payments.clientOrders}
                                </p>
                                <ul className="mb-2 max-h-28 overflow-auto rounded border border-zinc-200 bg-white py-1">
                                  {splitClientOrders.map((o) => (
                                    <li key={o.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSplitRows((prev) => {
                                            const next = [...prev];
                                            next[idx] = {
                                              ...next[idx]!,
                                              orderId: o.id,
                                              orderNumber: o.orderNumber,
                                              amount: suggestedAllocationAmount(
                                                o,
                                                splitCurrency || "UAH",
                                              ),
                                            };
                                            return next;
                                          });
                                          setSplitOrderForRowIndex(null);
                                          setSplitOrderSearch("");
                                          setSplitOrderCandidates([]);
                                        }}
                                        className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                                      >
                                        {o.orderNumber}
                                        {formatOrderOptionAmounts(o, splitCurrency || "UAH")}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p className="mb-2 text-xs text-zinc-500">{t.payments.noOrdersForContact}</p>
                            )}
                          </div>
                        )}
                        <p className="mb-1 text-xs text-zinc-500">{t.payments.searchOtherOrders}</p>
                        <input
                          type="text"
                          value={splitOrderSearch}
                          onChange={(e) => setSplitOrderSearch(e.target.value)}
                          placeholder={t.payments.orderNumberPlaceholder}
                          className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                          autoFocus
                        />
                        {splitOrderCandidates.length > 0 && (
                          <ul className="mt-1 max-h-32 overflow-auto rounded border border-zinc-200 bg-white py-1">
                            {splitOrderCandidates.map((o) => (
                              <li key={o.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSplitRows((prev) => {
                                      const next = [...prev];
                                      next[idx] = {
                                        ...next[idx]!,
                                        orderId: o.id,
                                        orderNumber: o.orderNumber,
                                        amount: suggestedAllocationAmount(
                                          o,
                                          splitCurrency || "UAH",
                                        ),
                                      };
                                      return next;
                                    });
                                    setSplitOrderForRowIndex(null);
                                    setSplitOrderSearch("");
                                    setSplitOrderCandidates([]);
                                  }}
                                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                                >
                                  {formatOrderSearchLabel(o)}
                                  {formatOrderOptionAmounts(o, splitCurrency || "UAH")}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSplitOrderForRowIndex(idx)}
                        className="text-left text-sm text-zinc-700 underline hover:text-zinc-900"
                      >
                        {row.orderNumber || t.payments.selectOrder}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) =>
                      setSplitRows((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx]!, amount: e.target.value };
                        return next;
                      })
                    }
                    placeholder={t.payments.amountPlaceholder}
                    className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSplitRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    {t.payments.remove}
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setSplitRows((prev) => [...prev, { orderId: "", orderNumber: "", amount: "" }])
                }
                className="rounded border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {t.payments.addOrder}
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              {t.payments.totalProgress(
                splitCurrency,
                splitRows
                  .reduce(
                    (s, r) => s + (parseFloat(r.amount.replace(/,/g, ".")) || 0),
                    0,
                  )
                  .toFixed(2),
                splitTotalAmount.toFixed(2),
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSplitTx(null);
                  setSplitFromEditPayment(null);
                  setSplitRows([]);
                  setSplitOrderForRowIndex(null);
                  resetSplitContactState();
                }}
                disabled={splitSubmitting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => void submitSplit()}
                disabled={
                  splitSubmitting ||
                  splitRows.every((r) => !r.orderId || !r.amount.trim()) ||
                  Math.abs(
                    splitRows.reduce(
                      (s, r) => s + (parseFloat(r.amount.replace(/,/g, ".")) || 0),
                      0,
                    ) - splitTotalAmount,
                  ) > 0.01
                }
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {splitSubmitting ? t.payments.saving : t.payments.distribute}
              </button>
            </div>
          </div>
        </div>
      )}

      {editPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">{t.payments.editPaymentTitle}</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {t.payments.editPaymentHint(
                editPayment.sourceType === "CASH" ? t.payments.cashKind : t.payments.bankKind,
              )}
            </p>
            {editPayment.sameTransactionOrderNumbers &&
              editPayment.sameTransactionOrderNumbers.length > 1 && (
              <p className="mt-1 text-sm text-zinc-600">
                {t.payments.ordersColon} {editPayment.sameTransactionOrderNumbers.join(", ")}
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-3">
                <div>
                  <p className="text-sm font-medium text-zinc-800">{t.payments.editReassignSection}</p>
                  <p className="text-xs text-zinc-500">{t.payments.editReassignHint}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500">{t.payments.editCurrentContact}</span>
                    <p className="mt-0.5 font-medium text-zinc-800">
                      {editPayment.contactLabel?.trim() ? editPayment.contactLabel : t.payments.dash}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500">{t.payments.editCurrentOrder}</span>
                    <p className="mt-0.5 font-medium text-zinc-800">
                      {editPayment.orderNumber ?? editPayment.orderId}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    {t.payments.contact}
                  </label>
                  <input
                    type="text"
                    value={editContactId ? editContactName : editContactSearch}
                    onChange={(e) => {
                      if (editContactId) {
                        setEditContactId(null);
                        setEditContactName("");
                        setEditContactOrders([]);
                        setEditContactSearch(e.target.value);
                      } else {
                        setEditContactSearch(e.target.value);
                      }
                      setEditOrderSearch("");
                      setEditOrderCandidates([]);
                    }}
                    onFocus={() => {
                      if (editContactId) {
                        setEditContactId(null);
                        setEditContactName("");
                        setEditContactOrders([]);
                        setEditContactSearch(editContactName);
                      }
                    }}
                    placeholder={t.payments.contactSearchPlaceholder}
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                  />
                  {editContactSearch.trim().length >= 3 && editContactsLoading && (
                    <p className="mt-1 text-xs text-zinc-500">{t.payments.searching}</p>
                  )}
                  {editContactCandidates.length > 0 && !editContactId && (
                    <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-white py-1">
                      {editContactCandidates.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditContactId(c.id);
                              setEditContactName(
                                [c.lastName, c.firstName].filter(Boolean).join(" ") || c.phone,
                              );
                              setEditContactSearch("");
                              setEditOrderId("");
                              setEditOrderNumber("");
                              setEditOrderSearch("");
                              setEditOrderCandidates([]);
                              void fetchOrdersForEdit(c.id);
                            }}
                            className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                          >
                            {[c.lastName, c.firstName].filter(Boolean).join(" ")}{" "}
                            {c.phone ? `· ${formatPhoneDisplay(c.phone)}` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {editContactId && (
                  <div className="space-y-1">
                    {editContactOrdersLoading ? (
                      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                        {t.payments.loadingOrders}
                      </div>
                    ) : editContactOrders.length === 0 ? (
                      <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-500">
                        {t.payments.noOrdersForContactEdit}
                      </div>
                    ) : (
                      <>
                        {editPayment.sourceType === "BANK" && editContactOrders.length >= 2 && (
                          <button
                            type="button"
                            disabled={savingPayment}
                            onClick={async () => {
                              const valid = buildSplitRowsFromOrders(
                                editContactOrders,
                                editPayment.amount,
                                editPayment.currency || "UAH",
                              );
                              if (valid.length === 0) {
                                pushToast(t.payments.errors.noAmountsSplit, "error");
                                return;
                              }
                              setSavingPayment(true);
                              try {
                                await apiHttp.post(`/payments/${editPayment.id}/split`, {
                                  allocations: valid.map((r) => ({
                                    orderId: r.orderId,
                                    amount: parseFloat(r.amount),
                                  })),
                                });
                                setEditPayment(null);
                                setEditContactId(null);
                                setEditContactName("");
                                setEditContactOrders([]);
                                setEditOrderId("");
                                setEditOrderNumber("");
                                await fetchPayments();
                              } catch (e) {
                                pushToast(
                                  e instanceof Error ? e.message : t.payments.distributeFailed,
                                  "error",
                                );
                              } finally {
                                setSavingPayment(false);
                              }
                            }}
                            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                          >
                            {savingPayment
                              ? t.payments.distributing
                              : t.payments.splitAcrossOrders(editContactOrders.length)}
                          </button>
                        )}
                        <input
                          type="text"
                          readOnly
                          value={editOrderId ? editOrderNumber : ""}
                          onClick={() => {
                            setEditOrderId("");
                            setEditOrderNumber("");
                          }}
                          placeholder={t.payments.selectOrderBelow}
                          className="w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 read-only:bg-zinc-50"
                        />
                        <ul className="max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-white py-0.5">
                          {editContactOrders.map((o) => (
                            <li key={o.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditOrderId(o.id);
                                  setEditOrderNumber(o.orderNumber ?? o.id);
                                }}
                                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 ${
                                  editOrderId === o.id
                                    ? "bg-zinc-100 font-medium text-zinc-900"
                                    : "text-zinc-700"
                                }`}
                              >
                                {o.orderNumber}
                                {formatOrderOptionAmounts(
                                  o,
                                  editPayment?.currency || editCurrency || "UAH",
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          type="button"
                          onClick={() => {
                            setEditContactId(null);
                            setEditContactName("");
                            setEditContactOrders([]);
                            setEditOrderId(editPayment?.orderId ?? "");
                            setEditOrderNumber(editPayment?.orderNumber ?? editPayment?.orderId ?? "");
                          }}
                          className="text-xs text-zinc-500 underline hover:text-zinc-700"
                        >
                          {t.payments.changeContact}
                        </button>
                      </>
                    )}
                  </div>
                )}
                {!editContactId && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-zinc-600">
                      {t.payments.editSearchOrderByNumber}
                    </label>
                    <input
                      type="text"
                      value={editOrderSearch}
                      onChange={(e) => {
                        setEditOrderSearch(e.target.value);
                        if (editOrderId && e.target.value !== editOrderNumber) {
                          setEditOrderId("");
                          setEditOrderNumber("");
                        }
                      }}
                      placeholder={t.payments.orderNumberPlaceholder}
                      className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                    {editOrderCandidates.length > 0 && (
                      <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-zinc-200 bg-white py-1">
                        {editOrderCandidates.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditOrderId(o.id);
                                setEditOrderNumber(o.orderNumber ?? o.id);
                                setEditOrderSearch(o.orderNumber ?? o.id);
                                setEditOrderCandidates([]);
                              }}
                              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 ${
                                editOrderId === o.id
                                  ? "bg-zinc-100 font-medium text-zinc-900"
                                  : "text-zinc-700"
                              }`}
                            >
                              {o.orderNumber}
                              {formatOrderOptionAmounts(
                                o,
                                editPayment?.currency || editCurrency || "UAH",
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              {editPayment.sourceType === "CASH" && (
                <>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={editAmount}
                      onChange={(e) => {
                        setEditAmount(e.target.value);
                        setEditAmountUsdTouched(false);
                      }}
                      placeholder={t.payments.amountInCurrency(editCurrency || editPayment.currency)}
                      className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                    <select
                      value={editCurrency}
                      onChange={(e) => {
                        setEditCurrency(e.target.value);
                        setEditAmountUsdTouched(false);
                      }}
                      className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-sm text-zinc-900"
                      aria-label={t.payments.currencyLabel}
                    >
                      {(["UAH", "USD", "EUR"] as const).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    type="datetime-local"
                    value={editPaidAt}
                    onChange={(e) => setEditPaidAt(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </>
              )}
              <input
                type="text"
                inputMode="decimal"
                value={editAmountUsd}
                onChange={(e) => {
                  setEditAmountUsd(e.target.value);
                  setEditAmountUsdTouched(true);
                }}
                disabled={userRole !== "ADMIN"}
                placeholder={t.payments.amountUsdFixed}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              {editPreviewUsd != null && !editAmountUsdTouched ? (
                <p className="text-xs text-zinc-500">
                  {t.payments.usdPreview}: {editPreviewUsd.toFixed(2)} $
                </p>
              ) : null}
              {editUsdFxWarning ? (
                <p className="text-xs text-amber-700">{t.payments.usdFxVarianceWarning}</p>
              ) : null}
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder={t.payments.notePlaceholder}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div className="mt-5 flex flex-wrap items-end justify-end gap-2">
              {editPayment.sourceType === "CASH" && userRole === "ADMIN" && (
                <div className="mr-auto max-w-[14rem]">
                  <button
                    type="button"
                    onClick={() => void submitDeleteCash()}
                    disabled={savingPayment}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {t.payments.deleteCashPayment}
                  </button>
                </div>
              )}
              {editPayment.sourceType === "BANK" &&
                (userRole === "ADMIN" || userRole === "LEAD" || userRole === "MANAGER") && (
                <div className="mr-auto max-w-[14rem]">
                  <button
                    type="button"
                    onClick={() => void submitUnallocate()}
                    disabled={savingPayment}
                    className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {savingPayment ? t.payments.unallocating : t.payments.unallocate}
                  </button>
                  <p className="mt-1 text-xs text-zinc-500">{t.payments.unallocateHint}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => setEditPayment(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={savingPayment}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingPayment ? t.payments.saving : t.common.save}
              </button>
            </div>
          </div>
        </div>
      )}
      {fxWriteOffOrder && (
        <FxWriteOffModal
          order={fxWriteOffOrder}
          open={!!fxWriteOffOrder}
          onClose={() => setFxWriteOffOrder(null)}
          onSuccess={() => {
            pushToast(t.payments.fxVariance.writeOffSuccess, "success");
            void fetchFxVariance();
          }}
        />
      )}
    </div>
  );
}
