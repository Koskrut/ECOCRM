"use client";

import React, { useCallback, useEffect, useState } from "react";

type PaymentItem = {
  id: string;
  orderId: string;
  sourceType: string;
  amount: number;
  currency: string;
  amountUsd?: number;
  sameTransactionOrderNumbers?: string[] | null;
  paidAt: string;
  status: string;
  note: string | null;
  bankTransaction?: {
    id: string;
    bookedAt: string;
    description: string | null;
    counterpartyName: string | null;
  } | null;
  createdBy?: { id: string; fullName: string } | null;
};

function formatPaymentAmount(p: { amount: number; currency: string; amountUsd?: number }): string {
  const usd = p.amountUsd ?? (p.currency === "USD" ? p.amount : 0);
  const sym = p.currency === "UAH" ? "₴" : p.currency === "EUR" ? "€" : "$";
  if (p.currency === "USD") return `+${p.amount.toFixed(2)} $`;
  return `+${p.amount.toFixed(2)} ${sym} (${usd.toFixed(2)} $)`;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
  OVERPAID: "Overpaid",
};

export type OrderPaymentBlockProps = {
  orderId: string;
  apiBaseUrl: string;
  paidAmount: number;
  totalAmount: number;
  paymentStatus?: string;
  currency: string;
  /** Called after payment added/updated; can be async. Parent should refetch order and optionally refresh list. */
  onSaved?: () => void | Promise<void>;
};

type SyncStatusAccount = { id: string; name: string; lastSyncAt: string | null; lastBookedAt: string | null };

export function OrderPaymentBlock({
  orderId,
  apiBaseUrl,
  paidAmount,
  totalAmount,
  paymentStatus,
  currency,
  onSaved,
}: OrderPaymentBlockProps) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusAccount[]>([]);
  const [syncLoading, setSyncLoading] = useState(false);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/payments`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Failed to load payments (${r.status})`);
      const data = (await r.json()) as PaymentItem[];
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      setPayments([]);
      setError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const r = await fetch(`${apiBaseUrl}/bank/sync/status`, { credentials: "include" });
      if (!r.ok) return;
      const data = (await r.json()) as { accounts?: SyncStatusAccount[] };
      setSyncStatus(Array.isArray(data.accounts) ? data.accounts : []);
    } catch {
      setSyncStatus([]);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    void fetchPayments();
    void fetchSyncStatus();
  }, [fetchPayments, fetchSyncStatus]);

  const runSync = useCallback(async () => {
    setSyncLoading(true);
    try {
      const r = await fetch(`${apiBaseUrl}/bank/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) throw new Error(await r.text());
      await fetchPayments();
      await fetchSyncStatus();
      await Promise.resolve(onSaved?.());
    } catch {
      // Error could be shown via a small toast; for now just stop loading
    } finally {
      setSyncLoading(false);
    }
  }, [apiBaseUrl, fetchPayments, fetchSyncStatus, onSaved]);

  const statusLabel = paymentStatus ? PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus : null;
  const lastSync = syncStatus.length > 0 && syncStatus[0]?.lastSyncAt
    ? new Date(syncStatus[0].lastSyncAt).toLocaleString()
    : null;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        В назначении платежа указывайте номер заказа — оплаты подтянутся автоматически.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{statusLabel ?? "Payment"}</span>
          {" · "}
          <span>
            {paidAmount.toFixed(2)} / {totalAmount.toFixed(2)} {currency}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void runSync()}
            disabled={syncLoading}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {syncLoading ? "Синхронізація…" : "Обновить оплаты сейчас"}
          </button>
          <button
            type="button"
            onClick={() => setShowAddCash(true)}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            + Наличная
          </button>
        </div>
      </div>
      {lastSync && (
        <p className="text-xs text-zinc-400">Остання синхронізація: {lastSync}</p>
      )}

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-xs text-zinc-500">Loading payments…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">Cash</h4>
            {payments.filter((p) => p.sourceType === "CASH").length === 0 ? (
              <p className="text-xs text-zinc-400">No cash payments</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "CASH")
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-600">
                        {new Date(p.paidAt).toLocaleDateString()}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="font-medium text-zinc-900">
                        {formatPaymentAmount(p)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">FOP (bank)</h4>
            {payments.filter((p) => p.sourceType === "BANK").length === 0 ? (
              <p className="text-xs text-zinc-400">No bank payments</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "BANK")
                  .map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-zinc-600">
                        {new Date(p.paidAt).toLocaleDateString()}
                        {p.bankTransaction?.counterpartyName
                          ? ` · ${p.bankTransaction.counterpartyName}`
                          : ""}
                        {p.sameTransactionOrderNumbers && p.sameTransactionOrderNumbers.length > 1
                          ? ` · Orders: ${p.sameTransactionOrderNumbers.join(", ")}`
                          : ""}
                      </span>
                      <span className="font-medium text-zinc-900">
                        {formatPaymentAmount(p)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showAddCash && (
        <AddCashPaymentModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          currency={currency}
          onClose={() => setShowAddCash(false)}
          onSaved={async () => {
            setShowAddCash(false);
            void fetchPayments();
            await Promise.resolve(onSaved?.());
          }}
        />
      )}
    </div>
  );
}

type AddCashPaymentModalProps = {
  apiBaseUrl: string;
  orderId: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
};

function AddCashPaymentModal({
  apiBaseUrl,
  orderId,
  currency,
  onClose,
  onSaved,
}: AddCashPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError("Enter a positive amount");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/payments/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId,
          amount: num,
          paidAt: new Date(paidAt).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-zinc-900">Cash payment</h3>
        <div className="mt-3 space-y-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Amount ({currency})</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Date & time</label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
