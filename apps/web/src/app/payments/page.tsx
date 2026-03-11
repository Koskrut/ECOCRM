"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiHttp } from "@/lib/api/client";

type BankAccount = { id: string; name: string; currency: string };

type PaymentItem = {
  id: string;
  orderId: string;
  orderNumber: string | null;
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
  } | null;
  createdBy: { id: string; fullName: string } | null;
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
};

type OrderOption = {
  id: string;
  orderNumber: string;
  totalAmount?: number;
  paidAmount?: number;
  debtAmount?: number;
  createdAt?: string;
};

type ContactOption = { id: string; firstName: string; lastName: string; phone: string };

function filterBySearch<T>(items: T[], search: string, getText: (t: T) => string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return items;
  return items.filter((t) => getText(t).toLowerCase().includes(q));
}

function formatPaymentAmount(p: { amount: number; currency: string; amountUsd?: number }): string {
  const usd = p.amountUsd ?? (p.currency === "USD" ? p.amount : 0);
  const sym = p.currency === "UAH" ? "₴" : p.currency === "EUR" ? "€" : "$";
  if (p.currency === "USD") {
    return `${p.amount.toFixed(2)} $`;
  }
  return `${p.amount.toFixed(2)} ${sym} (${usd.toFixed(2)} $)`;
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PaymentsContent />
    </Suspense>
  );
}

function PaymentsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get("view");
  const bankAccountId = searchParams.get("bankAccountId") ?? "";
  const [mode, setMode] = useState<"cash" | "fop">("fop");
  const [view, setView] = useState<"payments" | "unmatched">(
    viewParam === "unmatched" ? "unmatched" : "payments",
  );

  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [search, setSearch] = useState("");

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
  const [unmatched, setUnmatched] = useState<BankTransaction[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [unmatchedLoading, setUnmatchedLoading] = useState(false);
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
  const [addCashSubmitting, setAddCashSubmitting] = useState(false);
  const [splitTx, setSplitTx] = useState<BankTransaction | null>(null);
  const [splitFromEditPayment, setSplitFromEditPayment] = useState<PaymentItem | null>(null);
  const [splitRows, setSplitRows] = useState<{ orderId: string; orderNumber: string; amount: string }[]>([]);
  const [splitOrderSearch, setSplitOrderSearch] = useState("");
  const [splitOrderCandidates, setSplitOrderCandidates] = useState<OrderOption[]>([]);
  const [splitOrderForRowIndex, setSplitOrderForRowIndex] = useState<number | null>(null);
  const [splitSubmitting, setSplitSubmitting] = useState(false);
  const [bankSyncLoading, setBankSyncLoading] = useState(false);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => setUserRole(res.data?.user?.role ?? null))
      .catch(() => setUserRole(null));
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const r = await apiHttp.get<BankAccount[]>("/bank/accounts");
      setAccounts(Array.isArray(r.data) ? r.data : []);
    } catch {
      setAccounts([]);
    }
  }, []);

  const fetchPayments = useCallback(
    async (bankIdOverride?: string) => {
      setPaymentsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "500" });
        const bid = bankIdOverride !== undefined ? bankIdOverride : bankAccountId;
        if (bid) params.set("bankAccountId", bid);
        const r = await apiHttp.get<{ items: PaymentItem[]; total: number }>(
          `/payments?${params.toString()}`,
        );
        const items = Array.isArray(r.data?.items) ? r.data.items : [];
        setPayments(items);
        setPaymentsTotal(r.data?.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load payments");
        // Keep previous payments so the list does not disappear on transient 500
        // setPayments([]);
        // setPaymentsTotal(0);
      } finally {
        setPaymentsLoading(false);
      }
    },
    [bankAccountId],
  );

  const fetchUnmatched = useCallback(async () => {
    setUnmatchedLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ unmatched: "true", page: "1", pageSize: "500" });
      if (bankAccountId) params.set("bankAccountId", bankAccountId);
      const r = await apiHttp.get<{ items: BankTransaction[]; total: number }>(
        `/bank/transactions?${params.toString()}`,
      );
      setUnmatched(r.data?.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setUnmatched([]);
    } finally {
      setUnmatchedLoading(false);
    }
  }, [bankAccountId]);

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
        setSearch("");
        await fetchPayments(undefined);
        await fetchUnmatched();
        await fetchAccounts();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync failed");
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
    if (mode === "cash" || (mode === "fop" && view === "payments")) {
      fetchPayments(mode === "cash" ? "" : undefined);
    }
  }, [mode, view, fetchPayments]);

  useEffect(() => {
    if (mode === "fop") fetchUnmatched();
  }, [mode, fetchUnmatched]);

  const cashPayments = useMemo(
    () => filterBySearch(
      payments.filter((p) => p.sourceType === "CASH"),
      search,
      (p) => [p.orderNumber, p.note].filter(Boolean).join(" "),
    ),
    [payments, search],
  );
  const bankPayments = useMemo(
    () =>
      filterBySearch(
        payments.filter((p) => (String(p.sourceType ?? "").toUpperCase() === "BANK")),
        search,
        (p) =>
          [
            p.orderNumber,
            ...(p.sameTransactionOrderNumbers ?? []),
            p.bankTransaction?.counterpartyName,
            p.note,
          ]
            .filter(Boolean)
            .join(" "),
      ),
    [payments, search],
  );
  const filteredPayments = useMemo(
    () =>
      filterBySearch(
        payments,
        search,
        (p) =>
          [p.orderNumber, p.bankTransaction?.counterpartyName, p.note].filter(Boolean).join(" "),
      ),
    [payments, search],
  );
  const filteredUnmatched = useMemo(
    () =>
      filterBySearch(
        unmatched,
        search,
        (t) => [t.description, t.counterpartyName, t.bankAccount?.name].filter(Boolean).join(" "),
      ),
    [unmatched, search],
  );

  const submitImport = async () => {
    if (!selectedAccountId || !importFile) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const r = await fetch(`/api/bank/accounts/${selectedAccountId}/import`, {
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
      alert(e instanceof Error ? e.message : "Import failed");
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
        "/orders?page=1&pageSize=50&withCompanyClient=true",
      );
      const list = r.data?.items ?? [];
      const term = q.trim().toLowerCase();
      setOrderCandidates(
        list
          .filter(
            (o) =>
              o.orderNumber?.toLowerCase().includes(term) ||
              String(o.id).toLowerCase().includes(term),
          )
          .slice(0, 10),
      );
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
        "/orders?page=1&pageSize=50&withCompanyClient=true",
      );
      const list = r.data?.items ?? [];
      const term = q.trim().toLowerCase();
      setEditOrderCandidates(
        list
          .filter(
            (o) =>
              o.orderNumber?.toLowerCase().includes(term) ||
              String(o.id).toLowerCase().includes(term),
          )
          .slice(0, 10),
      );
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
        (c) => [c.firstName, c.lastName, c.phone].filter(Boolean).join(" "),
      ).slice(0, 15),
    [addCashContacts, addCashContactSearch],
  );

  const fetchUnpaidOrdersForContact = useCallback(async (contactId: string) => {
    setAddCashOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?contactId=${encodeURIComponent(contactId)}&page=1&pageSize=100&withCompanyClient=true`,
      );
      const list = (r.data?.items ?? []) as (OrderOption & { debtAmount?: number })[];
      setAddCashOrders(
        list.filter((o) => (Number(o.debtAmount ?? 0) > 0)),
      );
    } catch {
      setAddCashOrders([]);
    } finally {
      setAddCashOrdersLoading(false);
    }
  }, []);

  const fetchContactsForAllocate = useCallback(async () => {
    setAllocateContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[] }>(
        "/contacts?page=1&pageSize=300",
      );
      setAllocateContacts(r.data?.items ?? []);
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
        `/orders?contactId=${encodeURIComponent(contactId)}&page=1&pageSize=100&withCompanyClient=true`,
      );
      const list = (r.data?.items ?? []) as (OrderOption & { debtAmount?: number })[];
      setAllocateOrders(list.filter((o) => (Number((o as { debtAmount?: number }).debtAmount ?? 0) > 0)));
    } catch {
      setAllocateOrders([]);
    } finally {
      setAllocateOrdersLoading(false);
    }
  }, []);

  const allocateContactCandidates = useMemo(
    () =>
      allocateContactSearch.trim().length >= 3
        ? filterBySearch(
            allocateContacts,
            allocateContactSearch,
            (c) => [c.firstName, c.lastName, c.phone].filter(Boolean).join(" "),
          ).slice(0, 15)
        : [],
    [allocateContacts, allocateContactSearch],
  );

  useEffect(() => {
    if (allocateTxId) void fetchContactsForAllocate();
  }, [allocateTxId, fetchContactsForAllocate]);

  useEffect(() => {
    if (allocateContactId) void fetchUnpaidOrdersForAllocate(allocateContactId);
  }, [allocateContactId, fetchUnpaidOrdersForAllocate]);

  const fetchEditContacts = useCallback(async () => {
    setEditContactsLoading(true);
    try {
      const r = await apiHttp.get<{ items: ContactOption[] }>(
        "/contacts?page=1&pageSize=300",
      );
      setEditContacts(r.data?.items ?? []);
    } catch {
      setEditContacts([]);
    } finally {
      setEditContactsLoading(false);
    }
  }, []);

  const fetchUnpaidOrdersForEdit = useCallback(async (contactId: string) => {
    setEditContactOrdersLoading(true);
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        `/orders?contactId=${encodeURIComponent(contactId)}&page=1&pageSize=100&withCompanyClient=true`,
      );
      const list = (r.data?.items ?? []) as (OrderOption & { debtAmount?: number })[];
      setEditContactOrders(list.filter((o) => (Number(o.debtAmount ?? 0) > 0)));
    } catch {
      setEditContactOrders([]);
    } finally {
      setEditContactOrdersLoading(false);
    }
  }, []);

  const editContactCandidates = useMemo(
    () =>
      editContactSearch.trim().length >= 3
        ? filterBySearch(
            editContacts,
            editContactSearch,
            (c) => [c.firstName, c.lastName, c.phone].filter(Boolean).join(" "),
          ).slice(0, 15)
        : [],
    [editContacts, editContactSearch],
  );

  useEffect(() => {
    if (editPayment) void fetchEditContacts();
  }, [editPayment, fetchEditContacts]);

  useEffect(() => {
    if (editContactId) void fetchUnpaidOrdersForEdit(editContactId);
  }, [editContactId, fetchUnpaidOrdersForEdit]);

  const submitAddCashPayment = async () => {
    if (!addCashOrderId) {
      alert("Select an order");
      return;
    }
    const num = parseFloat(addCashAmount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      alert("Enter a positive amount");
      return;
    }
    setAddCashSubmitting(true);
    try {
      await apiHttp.post("/payments/cash", {
        orderId: addCashOrderId,
        amount: num,
        currency: addCashCurrency,
        paidAt: new Date(addCashPaidAt).toISOString(),
        note: addCashNote.trim() || undefined,
      });
      setShowAddCashPayment(false);
      setAddCashContactId(null);
      setAddCashContactName("");
      setAddCashOrderId(null);
      setAddCashOrderNumber("");
      setAddCashOrders([]);
      setAddCashAmount("");
      setAddCashCurrency("UAH");
      setAddCashNote("");
      await fetchPayments("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add payment");
    } finally {
      setAddCashSubmitting(false);
    }
  };

  const searchOrdersForSplit = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSplitOrderCandidates([]);
      return;
    }
    try {
      const r = await apiHttp.get<{ items: OrderOption[] }>(
        "/orders?page=1&pageSize=50&withCompanyClient=true",
      );
      const list = r.data?.items ?? [];
      const term = q.trim().toLowerCase();
      setSplitOrderCandidates(
        list
          .filter(
            (o) =>
              o.orderNumber?.toLowerCase().includes(term) ||
              String(o.id).toLowerCase().includes(term),
          )
          .slice(0, 10),
      );
    } catch {
      setSplitOrderCandidates([]);
    }
  }, []);

  useEffect(() => {
    if (!splitTx && !splitFromEditPayment) return;
    const t = setTimeout(() => void searchOrdersForSplit(splitOrderSearch), 300);
    return () => clearTimeout(t);
  }, [splitTx, splitFromEditPayment, splitOrderSearch, searchOrdersForSplit]);

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

  const submitAllocate = async () => {
    if (!allocateTxId || !selectedOrderId) return;
    setAllocating(allocateTxId);
    try {
      await apiHttp.post("/payments/allocate", {
        transactionId: allocateTxId,
        orderId: selectedOrderId,
      });
      closeAllocateModal();
      await fetchUnmatched();
      setView("payments");
      await fetchPayments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setAllocating(null);
    }
  };

  const splitTotalAmount = splitFromEditPayment
    ? splitFromEditPayment.amount
    : splitTx?.amount ?? 0;
  const splitCurrency = splitFromEditPayment?.currency ?? splitTx?.currency ?? "";

  const submitSplit = async () => {
    const valid = splitRows.filter((r) => r.orderId && r.amount.trim());
    if (valid.length === 0) {
      alert("Add at least one order with amount");
      return;
    }
    const amounts = valid.map((r) => parseFloat(r.amount.replace(/,/g, ".")));
    if (amounts.some((a) => !Number.isFinite(a) || a <= 0)) {
      alert("All amounts must be positive numbers");
      return;
    }
    const total = amounts.reduce((s, a) => s + a, 0);
    if (Math.abs(total - splitTotalAmount) > 0.01) {
      alert(`Total ${total.toFixed(2)} must equal ${splitTotalAmount.toFixed(2)} ${splitCurrency}`);
      return;
    }
    setSplitSubmitting(true);
    try {
      if (splitFromEditPayment) {
        await apiHttp.post(`/payments/${splitFromEditPayment.id}/split`, {
          allocations: valid.map((r, i) => ({ orderId: r.orderId, amount: amounts[i] })),
        });
        setSplitFromEditPayment(null);
      } else if (splitTx) {
        await apiHttp.post("/payments/allocate-split", {
          transactionId: splitTx.id,
          allocations: valid.map((r, i) => ({ orderId: r.orderId, amount: amounts[i] })),
        });
        setSplitTx(null);
        await fetchUnmatched();
        setView("payments");
      }
      setSplitRows([]);
      setSplitOrderForRowIndex(null);
      setSplitOrderSearch("");
      await fetchPayments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Split failed");
    } finally {
      setSplitSubmitting(false);
    }
  };

  const openEdit = (p: PaymentItem) => {
    setEditPayment(p);
    setEditAmount(String(p.amount));
    setEditAmountUsd(typeof p.amountUsd === "number" ? String(p.amountUsd) : "");
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
  };

  const submitEdit = async () => {
    if (!editPayment) return;
    setSavingPayment(true);
    try {
      const payload: {
        amount?: number;
        amountUsd?: number;
        paidAt?: string;
        note?: string;
        orderId?: string;
      } = {};
      if (editPayment.sourceType === "CASH") {
        payload.paidAt = new Date(editPaidAt).toISOString();
        if (userRole === "ADMIN") {
          const num = parseFloat(editAmount.replace(/,/g, "."));
          if (!Number.isFinite(num) || num <= 0) throw new Error("Invalid amount");
          payload.amount = num;
        }
      }
      if (userRole === "ADMIN" && editAmountUsd.trim() !== "") {
        const usd = parseFloat(editAmountUsd.replace(/,/g, "."));
        if (Number.isFinite(usd) && usd >= 0) payload.amountUsd = usd;
      }
      payload.note = editNote.trim() || undefined;
      if (editOrderId && editOrderId !== editPayment.orderId) payload.orderId = editOrderId;
      await apiHttp.patch(`/payments/${editPayment.id}`, payload);
      setEditPayment(null);
      await fetchPayments();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingPayment(false);
    }
  };

  const loading =
    mode === "cash"
      ? paymentsLoading
      : mode === "fop" && view === "unmatched"
        ? unmatchedLoading
        : paymentsLoading;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-2xl font-bold text-zinc-900">Payments</h1>
            <div className="flex rounded-lg border border-zinc-200 p-0.5">
              <button
                type="button"
                onClick={() => setMode("cash")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "cash" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => setMode("fop")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  mode === "fop" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                FOP
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Список платежей и непривязанных банковских операций. Переключатель ФОП — выбор банковского счёта. ФОПы настраиваются в Settings → ФОП.
          </p>
        </div>
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
            + Add payment
          </button>
        )}
        {mode === "fop" && (
          <>
            <button
              type="button"
              onClick={() => void runBankSync()}
              disabled={bankSyncLoading}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {bankSyncLoading ? "Синхронізація…" : "Обновить оплаты сейчас"}
            </button>
            <button
              type="button"
              onClick={() => void runBankSync({ forYesterday: true })}
              disabled={bankSyncLoading}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              Синхронизировать за вчера
            </button>
            <button
              type="button"
              onClick={() => setShowAddStatement(true)}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm hover:bg-zinc-50"
            >
              + Add statement
            </button>
          </>
        )}
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {mode === "fop" && (
              <>
                <div className="flex rounded-lg border border-zinc-200 p-0.5">
                  <button
                    type="button"
                    onClick={() => setView("payments")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "payments"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("unmatched")}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                      view === "unmatched"
                        ? "bg-zinc-800 text-white"
                        : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                  >
                    Unmatched
                  </button>
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-600">
                  Банковский счёт (ФОП)
                  <select
                    value={bankAccountId}
                    onChange={(e) => setBankAccountId(e.target.value)}
                    className="rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-500 focus:outline-none"
                  >
                    <option value="">Все</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-500 focus:outline-none w-40"
            />
          </div>
        </div>

        {error && <p className="px-4 py-2 text-sm text-red-600">{error}</p>}
        {loading && <p className="px-4 py-6 text-sm text-zinc-500">Loading…</p>}

        {!loading && mode === "cash" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">FOP</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3 w-24">Action</th>
                </tr>
              </thead>
              <tbody>
                {cashPayments.map((p) => (
                  <tr key={p.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">
                      {new Date(p.paidAt).toLocaleDateString()}
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
                    <td className="px-4 py-3">Cash</td>
                    <td className="px-4 py-3">—</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatPaymentAmount(p)}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate">{p.note ?? "—"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {cashPayments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                      No cash payments
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && mode === "fop" && view === "payments" && (
          <>
            <p className="px-4 py-2 text-sm text-zinc-600">
              Банковские платежи (привязанные к заказам): {bankPayments.length}
              {search.trim() ? ` (поиск: «${search.trim()}»)` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">FOP</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3">Counterparty</th>
                    <th className="px-4 py-3 w-24">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {bankPayments.map((p, idx) => (
                    <tr
                      key={p.id ?? `bank-${idx}`}
                      className="border-t border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3 text-zinc-600">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {p.sameTransactionOrderNumbers?.length ? (
                          <span className="text-zinc-700">
                            {p.sameTransactionOrderNumbers.flatMap((num, i) => [
                              i > 0 ? ", " : null,
                              num === p.orderNumber ? (
                                <Link
                                  key={num}
                                  href={`/orders?orderId=${p.orderId}`}
                                  className="font-medium text-zinc-900 hover:underline"
                                >
                                  {num}
                                </Link>
                              ) : (
                                <span key={num}>{num}</span>
                              ),
                            ])}
                          </span>
                        ) : p.orderNumber ? (
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
                      <td className="px-4 py-3">Bank</td>
                      <td className="px-4 py-3">
                        {p.bankTransaction?.bankAccount?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatPaymentAmount(p)}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate">
                        {p.bankTransaction?.counterpartyName ?? p.note ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bankPayments.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                        {search.trim() &&
                        payments.filter((p) => p.sourceType === "BANK").length > 0
                          ? "Нет банковских платежей по вашему поиску. Очистите поле Search."
                          : "No bank payments"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {filteredUnmatched.length > 0 && (
              <>
                <p className="px-4 pt-4 text-sm text-zinc-600">
                  Непривязанные банковские операции: {filteredUnmatched.length}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">FOP</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3">Counterparty</th>
                        <th className="px-4 py-3 w-32">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnmatched.map((tx) => (
                        <tr
                          key={tx.id}
                          className="border-t border-zinc-100 hover:bg-zinc-50"
                        >
                          <td className="px-4 py-3 text-zinc-600">
                            {new Date(tx.bookedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            {tx.bankAccount?.name ?? tx.bankAccountId}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            +{tx.amount.toFixed(2)} {tx.currency}
                          </td>
                          <td
                            className="px-4 py-3 max-w-xs truncate"
                            title={tx.description ?? ""}
                          >
                            {tx.description ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            {tx.counterpartyName ?? "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setAllocateTxId(tx.id);
                                  setAllocateTx(tx);
                                  setAllocateContactSearch("");
                                  setAllocateContactId(null);
                                  setAllocateContactName("");
                                  setAllocateOrders([]);
                                  setSelectedOrderId(null);
                                  setAllocateOrderNumber("");
                                  setOrderSearch("");
                                }}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                              >
                                Allocate to order
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSplitTx(tx);
                                  setSplitRows([
                                    { orderId: "", orderNumber: "", amount: "" },
                                  ]);
                                  setSplitOrderSearch("");
                                  setSplitOrderForRowIndex(null);
                                }}
                                className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                              >
                                Distribute
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {!loading && mode === "fop" && view === "unmatched" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-100/80 text-left text-xs font-medium uppercase text-zinc-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">FOP</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Counterparty</th>
                  <th className="px-4 py-3 w-32">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnmatched.map((tx) => (
                  <tr key={tx.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-4 py-3 text-zinc-600">
                      {new Date(tx.bookedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">{tx.bankAccount?.name ?? tx.bankAccountId}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      +{tx.amount.toFixed(2)} {tx.currency}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={tx.description ?? ""}>
                      {tx.description ?? "—"}
                    </td>
                    <td className="px-4 py-3">{tx.counterpartyName ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAllocateTxId(tx.id);
                            setAllocateTx(tx);
                            setAllocateContactSearch("");
                            setAllocateContactId(null);
                            setAllocateContactName("");
                            setAllocateOrders([]);
                            setSelectedOrderId(null);
                            setAllocateOrderNumber("");
                            setOrderSearch("");
                          }}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Allocate to order
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSplitTx(tx);
                            setSplitRows([{ orderId: "", orderNumber: "", amount: "" }]);
                            setSplitOrderSearch("");
                            setSplitOrderForRowIndex(null);
                          }}
                          className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        >
                          Distribute
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUnmatched.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                      No unmatched transactions
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && mode === "cash" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {search ? `${cashPayments.length} of ${payments.filter((p) => p.sourceType === "CASH").length}` : payments.filter((p) => p.sourceType === "CASH").length} cash
          </p>
        )}
        {!loading && mode === "fop" && view === "payments" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {search ? `${bankPayments.length} of ${payments.filter((p) => p.sourceType === "BANK").length}` : payments.filter((p) => p.sourceType === "BANK").length} bank
          </p>
        )}
        {!loading && mode === "fop" && view === "unmatched" && (
          <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500">
            {search ? `${filteredUnmatched.length} of ${unmatched.length}` : unmatched.length} unmatched
          </p>
        )}
      </section>

      {showAddCashPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">Add payment (cash)</h3>
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
                  placeholder="Contact (name or phone, min 3 chars)"
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
                            setAddCashContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone);
                            setAddCashContactSearch("");
                            setAddCashOrderId(null);
                            setAddCashOrderNumber("");
                            void fetchUnpaidOrdersForContact(c.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          {[c.firstName, c.lastName].filter(Boolean).join(" ")} {c.phone ? `· ${c.phone}` : ""}
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
                      Loading orders…
                    </div>
                  ) : addCashOrders.length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      No unpaid orders for this contact
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        readOnly
                        value={addCashOrderId ? addCashOrderNumber : ""}
                        onClick={() => setAddCashOrderId(null)}
                        placeholder="Order (select below)"
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
                              {o.totalAmount != null ? ` · ${o.totalAmount} UAH` : ""}
                              {o.debtAmount != null && o.debtAmount > 0 ? ` (debt ${o.debtAmount})` : ""}
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
                        Change contact
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
                  placeholder="Amount"
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
                placeholder="Note (optional)"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddCashPayment(false);
                  setAddCashContactId(null);
                  setAddCashContactName("");
                  setAddCashOrderId(null);
                  setAddCashOrderNumber("");
                  setAddCashOrders([]);
                  setAddCashAmount("");
                  setAddCashCurrency("UAH");
                  setAddCashNote("");
                }}
                disabled={addCashSubmitting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitAddCashPayment()}
                disabled={!addCashOrderId || !addCashAmount.trim() || addCashSubmitting}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {addCashSubmitting ? "Saving…" : "Add payment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
            <h3 className="text-sm font-semibold text-zinc-900">Add statement</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Upload CSV: date, amount, description, counterpartyName (or Ukrainian equivalents)
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Bank account (FOP)</label>
                <select
                  value={selectedAccountId ?? ""}
                  onChange={(e) => setSelectedAccountId(e.target.value || null)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">CSV file</label>
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
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitImport()}
                disabled={!selectedAccountId || !importFile || importing}
                className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {importing ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      )}

      {allocateTxId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">Allocate to order</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Find contact (min 3 chars), then choose unpaid order — or distribute across orders.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500">Contact</label>
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
                  placeholder="Search contact (min 3 chars)…"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                {allocateContactCandidates.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-white py-1">
                    {allocateContactCandidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setAllocateContactId(c.id);
                            setAllocateContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone);
                            setAllocateContactSearch("");
                            setSelectedOrderId(null);
                            setAllocateOrderNumber("");
                            void fetchUnpaidOrdersForAllocate(c.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                        >
                          {[c.firstName, c.lastName].filter(Boolean).join(" ")} {c.phone ? `· ${c.phone}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {allocateContactId && (
                <div>
                  <label className="block text-xs font-medium text-zinc-500">Order (unpaid)</label>
                  {allocateOrdersLoading ? (
                    <div className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      Loading orders…
                    </div>
                  ) : allocateOrders.length === 0 ? (
                    <div className="mt-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
                      No unpaid orders for this contact
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
                        placeholder="Select order below"
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
                              {o.totalAmount != null ? ` · ${o.totalAmount}` : ""}
                              {((o as { debtAmount?: number }).debtAmount ?? 0) > 0
                                ? ` (debt ${(o as { debtAmount?: number }).debtAmount})`
                                : ""}
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
                        Change contact
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
                  if (allocateTx) {
                    setSplitTx(allocateTx);
                    setSplitRows([{ orderId: "", orderNumber: "", amount: "" }]);
                    setSplitOrderSearch("");
                    setSplitOrderForRowIndex(null);
                  }
                  closeAllocateModal();
                }}
                disabled={!!allocating}
                className="text-sm text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
              >
                Or distribute across orders →
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeAllocateModal}
                  disabled={!!allocating}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitAllocate()}
                  disabled={!selectedOrderId || !!allocating}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {allocating ? "Allocating…" : "Allocate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {(splitTx || splitFromEditPayment) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">Distribute payment</h3>
            <p className="mt-1 text-sm text-zinc-500">
              {splitFromEditPayment ? "Payment" : "Transaction"}: {splitTotalAmount.toFixed(2)} {splitCurrency}. Split across orders — total must match.
            </p>
            <div className="mt-4 space-y-3">
              {splitRows.map((row, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-2">
                  <div className="min-w-0 flex-1">
                    {splitOrderForRowIndex === idx ? (
                      <>
                        <input
                          type="text"
                          value={splitOrderSearch}
                          onChange={(e) => setSplitOrderSearch(e.target.value)}
                          placeholder="Order number…"
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
                                      next[idx] = { ...next[idx]!, orderId: o.id, orderNumber: o.orderNumber };
                                      return next;
                                    });
                                    setSplitOrderForRowIndex(null);
                                    setSplitOrderSearch("");
                                    setSplitOrderCandidates([]);
                                  }}
                                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100"
                                >
                                  {o.orderNumber}
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
                        {row.orderNumber || "Select order…"}
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
                    placeholder="Amount"
                    className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSplitRows((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                  >
                    Remove
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
                + Add order
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Total:{" "}
              {splitRows
                .reduce(
                  (s, r) => s + (parseFloat(r.amount.replace(/,/g, ".")) || 0),
                  0,
                )
                .toFixed(2)}{" "}
              {splitCurrency} / {splitTotalAmount.toFixed(2)} {splitCurrency}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setSplitTx(null);
                  setSplitFromEditPayment(null);
                  setSplitRows([]);
                  setSplitOrderForRowIndex(null);
                }}
                disabled={splitSubmitting}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
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
                {splitSubmitting ? "Saving…" : "Distribute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-zinc-900">Edit payment</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {editPayment.sourceType === "CASH" ? "Cash" : "Bank"} · change order via contact below
            </p>
            {editPayment.sameTransactionOrderNumbers && editPayment.sameTransactionOrderNumbers.length > 0 && (
              <p className="mt-1 text-sm text-zinc-600">
                Orders: {editPayment.sameTransactionOrderNumbers.join(", ")}
              </p>
            )}
            <div className="mt-4 space-y-3">
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
                }}
                onFocus={() => {
                  if (editContactId) {
                    setEditContactId(null);
                    setEditContactName("");
                    setEditContactOrders([]);
                    setEditContactSearch(editContactName);
                  }
                }}
                placeholder="Contact (min 3 chars to change order)"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
              {editContactCandidates.length > 0 && (
                <ul className="max-h-32 overflow-auto rounded-lg border border-zinc-200 py-1">
                  {editContactCandidates.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setEditContactId(c.id);
                          setEditContactName([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone);
                          setEditContactSearch("");
                          setEditOrderId("");
                          setEditOrderNumber("");
                          void fetchUnpaidOrdersForEdit(c.id);
                        }}
                        className="w-full px-3 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        {[c.firstName, c.lastName].filter(Boolean).join(" ")} {c.phone ? `· ${c.phone}` : ""}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {editContactId && (
                <div className="space-y-1">
                  {editContactOrdersLoading ? (
                    <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500">
                      Loading orders…
                    </div>
                  ) : editContactOrders.length === 0 ? (
                    <div className="rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-500">
                      No unpaid orders
                    </div>
                  ) : (
                    <>
                      {editPayment.sourceType === "BANK" && editContactOrders.length >= 2 && (
                        <button
                          type="button"
                          disabled={savingPayment}
                          onClick={async () => {
                            const total = editPayment.amount;
                            const orders = [...editContactOrders] as (OrderOption & { debtAmount?: number })[];
                            const byDate = (a: { createdAt?: string }, b: { createdAt?: string }) =>
                              new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
                            orders.sort(byDate);
                            const totalDebt = orders.reduce(
                              (s, o) => s + (Number(o.debtAmount ?? 0) > 0 ? Number(o.debtAmount) : 0),
                              0,
                            );
                            let rows: { orderId: string; orderNumber: string; amount: string }[];
                            if (totalDebt > 0) {
                              let remaining = total;
                              rows = orders.map((o) => {
                                const debt = Number(o.debtAmount ?? 0) > 0 ? Number(o.debtAmount) : 0;
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
                              const perOrder = total / orders.length;
                              rows = orders.map((o, i) => ({
                                orderId: o.id,
                                orderNumber: o.orderNumber ?? o.id,
                                amount: (i === orders.length - 1 ? total - perOrder * (orders.length - 1) : perOrder).toFixed(2),
                              }));
                            }
                            const valid = rows.filter((r) => parseFloat(r.amount) > 0);
                            if (valid.length === 0) {
                              alert("No amounts to distribute");
                              return;
                            }
                            setSavingPayment(true);
                            try {
                              await apiHttp.post(`/payments/${editPayment.id}/split`, {
                                allocations: valid.map((r) => ({ orderId: r.orderId, amount: parseFloat(r.amount) })),
                              });
                              setEditPayment(null);
                              setEditContactId(null);
                              setEditContactName("");
                              setEditContactOrders([]);
                              setEditOrderId("");
                              setEditOrderNumber("");
                              await fetchPayments();
                            } catch (e) {
                              alert(e instanceof Error ? e.message : "Distribute failed");
                            } finally {
                              setSavingPayment(false);
                            }
                          }}
                          className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                        >
                          {savingPayment ? "Distributing…" : `Distribute across orders (${editContactOrders.length})`}
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
                        placeholder="Order (select below)"
                        className="w-full cursor-pointer rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 read-only:bg-zinc-50"
                      />
                      <ul className="max-h-24 overflow-auto rounded-lg border border-zinc-200 py-0.5">
                        {editContactOrders.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setEditOrderId(o.id);
                                setEditOrderNumber(o.orderNumber ?? o.id);
                              }}
                              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-100 ${
                                editOrderId === o.id ? "bg-zinc-100 font-medium text-zinc-900" : "text-zinc-700"
                              }`}
                            >
                              {o.orderNumber}
                              {((o as { debtAmount?: number }).debtAmount ?? 0) > 0
                                ? ` (debt ${(o as { debtAmount?: number }).debtAmount})`
                                : ""}
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
                        Change contact
                      </button>
                    </>
                  )}
                </div>
              )}
              {!editContactId && (
                <input
                  type="text"
                  readOnly
                  value={editOrderNumber || editOrderId || ""}
                  placeholder="Order (current)"
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
                />
              )}
              {editPayment.sourceType === "CASH" && (
                <>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    disabled={userRole !== "ADMIN"}
                    placeholder={`Amount (${editPayment.currency})`}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500"
                  />
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
                onChange={(e) => setEditAmountUsd(e.target.value)}
                disabled={userRole !== "ADMIN"}
                placeholder="Amount (USD), fixed"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Note"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditPayment(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitEdit}
                disabled={savingPayment}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {savingPayment ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
