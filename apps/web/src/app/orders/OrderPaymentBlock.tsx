"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { isForeignOrderCurrency, orderCurrencySymbol } from "@/lib/base-currency";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatDate } from "@/lib/crmDatetime";
import { payRequestStatusLabel } from "@/lib/status-labels";
import { strings } from "@/locales";

const pt = strings.orders.modal.paymentBlock;

function isReceiverCodeHintError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("єдрпоу") ||
    m.includes("іпн") ||
    m.includes("fop") ||
    m.includes("receivercode") ||
    m.includes("nbu payment link")
  );
}

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

function formatPaymentAmount(p: { amount: number; currency: string; amountUsd?: number; sourceType?: string }): string {
  const usd = p.amountUsd ?? (p.currency === "USD" ? p.amount : 0);
  const sym = p.currency === "UAH" ? "₴" : p.currency === "EUR" ? "€" : "$";
  const isTransfer = p.sourceType === "CREDIT_TRANSFER";
  const isCredit = p.sourceType === "CREDIT" || isTransfer;
  const sign = p.amount < 0 ? "−" : isCredit ? (isTransfer ? "" : "залік ") : "+";
  const absAmt = Math.abs(p.amount);
  const absUsd = Math.abs(usd);
  if (p.currency === "USD") return `${sign}${absAmt.toFixed(2)} $`;
  return `${sign}${absAmt.toFixed(2)} ${sym} (${absUsd.toFixed(2)} $)`;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: pt.unpaid,
  PARTIALLY_PAID: pt.partiallyPaid,
  PAID: pt.paid,
  OVERPAID: pt.overpaid,
};

type PaymentRequestListItem = {
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

const PAY_REQ_STATUS_UA: Record<string, string> = {
  PENDING: "Очікує оплату",
  PAID: "Оплачено",
  EXPIRED: "Прострочено",
  CANCELED: "Скасовано",
};

export type OrderPaymentBlockProps = {
  orderId: string;
  orderNumber: string;
  apiBaseUrl: string;
  paidAmount: number;
  totalAmount: number;
  /** Рекомендована сума посилання (борг). */
  debtAmount: number;
  /** Доступна переплата після повернення / оверпейменту. */
  creditAmount?: number;
  /** Клієнт замовлення — для переносу переплати на інший заказ. */
  clientId?: string | null;
  paymentStatus?: string;
  currency: string;
  /** UAH per 1 USD — fixed at order creation; used to show amount in UAH next to USD. */
  exchangeRate?: number | null;
  /** FX variance written off in order currency (USD/EUR). */
  fxWriteOffAmount?: number;
  /** Called after payment added/updated; can be async. Parent should refetch order and optionally refresh list. */
  onSaved?: () => void | Promise<void>;
};

export function OrderPaymentBlock({
  orderId,
  orderNumber,
  apiBaseUrl,
  paidAmount,
  totalAmount,
  debtAmount,
  creditAmount = 0,
  clientId,
  paymentStatus,
  currency,
  exchangeRate,
  fxWriteOffAmount = 0,
  onSaved,
}: OrderPaymentBlockProps) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddCash, setShowAddCash] = useState(false);
  const [editCash, setEditCash] = useState<PaymentItem | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [payLinks, setPayLinks] = useState<PaymentRequestListItem[]>([]);
  const [payLinksLoading, setPayLinksLoading] = useState(true);
  const [payLinksError, setPayLinksError] = useState<string | null>(null);
  const [showPayLinkModal, setShowPayLinkModal] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${apiBaseUrl}/auth/me`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as { user?: { role?: string } };
        setUserRole(data.user?.role ?? null);
      })
      .catch(() => setUserRole(null));
  }, [apiBaseUrl]);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/payments`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Не вдалося завантажити оплати (${r.status})`);
      const data = (await r.json()) as PaymentItem[];
      setPayments(Array.isArray(data) ? data : []);
    } catch (e) {
      setPayments([]);
      setError(e instanceof Error ? e.message : pt.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  const fetchPaymentRequests = useCallback(async () => {
    setPayLinksLoading(true);
    setPayLinksError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/payment-requests`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) throw new Error(`Не вдалося завантажити посилання (${r.status})`);
      const data = (await r.json()) as PaymentRequestListItem[];
      setPayLinks(Array.isArray(data) ? data : []);
    } catch (e) {
      setPayLinks([]);
      setPayLinksError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setPayLinksLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  useEffect(() => {
    void fetchPaymentRequests();
  }, [fetchPaymentRequests]);

  const statusLabel = paymentStatus ? PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus : null;
  const effectivePaid = paidAmount + Math.max(0, fxWriteOffAmount);
  const hasCredit = creditAmount > 0.009;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        У призначенні платежу вказуйте номер замовлення — оплати підтягнуться автоматично.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm text-zinc-600">
          <span className="font-medium text-zinc-900">{statusLabel ?? pt.payment}</span>
          {" · "}
          <span>
            {formatOrderAmount(effectivePaid, currency, exchangeRate)} / {formatOrderAmount(totalAmount, currency, exchangeRate)}
          </span>
          {fxWriteOffAmount > 0 ? (
            <span className="block text-xs text-zinc-500">
              з них {formatOrderAmount(fxWriteOffAmount, currency, exchangeRate)} — списання курсової різниці
            </span>
          ) : null}
          {hasCredit ? (
            <span className="mt-1 block text-xs font-medium text-sky-800">
              {pt.overpaymentLabel}: {formatOrderAmount(creditAmount, currency, exchangeRate)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasCredit && clientId ? (
            <button
              type="button"
              onClick={() => setShowTransfer(true)}
              className="rounded-md border border-sky-200 bg-sky-50/80 px-3 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100"
            >
              {pt.transferCredit}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setShowPayLinkModal(true)}
            className="rounded-md border border-emerald-200 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
          >
            Посилання на оплату
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

      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="mb-2 text-xs font-medium text-zinc-600">Посилання на оплату (IBAN)</div>
        {payLinksError ? <p className="text-xs text-red-600">{payLinksError}</p> : null}
        {payLinksLoading ? (
          <p className="text-xs text-zinc-400">Завантаження…</p>
        ) : payLinks.length === 0 ? (
          <p className="text-xs text-zinc-400">Ще немає посилань. Натисніть «Посилання на оплату».</p>
        ) : (
          <ul className="space-y-3">
            {payLinks.map((pl) => (
              <li key={pl.id} className="rounded border border-zinc-100 bg-zinc-50/80 p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-zinc-800">
                    {payRequestStatusLabel(pl.effectiveStatus)}
                  </span>
                  <span className="text-zinc-600">
                    {pl.amount.toFixed(2)} {pl.currency}
                  </span>
                </div>
                <p className="mt-1 text-zinc-500 line-clamp-2">{pl.purpose}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50"
                    onClick={() => {
                      const url = `${typeof window !== "undefined" ? window.location.origin : ""}/pay/${pl.publicToken}`;
                      void navigator.clipboard.writeText(url);
                    }}
                  >
                    Копіювати посилання
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50"
                    onClick={() => void navigator.clipboard.writeText(pl.iban)}
                  >
                    Копіювати IBAN
                  </button>
                  <button
                    type="button"
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] hover:bg-zinc-50"
                    onClick={() => void navigator.clipboard.writeText(pl.purpose)}
                  >
                    Копіювати призначення
                  </button>
                  <a
                    href={`/pay/${pl.publicToken}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-zinc-200 bg-white px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-50"
                  >
                    Відкрити
                  </a>
                  {pl.effectiveStatus === "PENDING" ? (
                    <button
                      type="button"
                      className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                      onClick={async () => {
                        if (!confirm("Скасувати це посилання?")) return;
                        const r = await fetch(`${apiBaseUrl}/payment-requests/${pl.id}/cancel`, {
                          method: "POST",
                          credentials: "include",
                        });
                        if (!r.ok) {
                          alert(await r.text());
                          return;
                        }
                        void fetchPaymentRequests();
                      }}
                    >
                      Скасувати
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : loading ? (
        <p className="text-xs text-zinc-500">{pt.loading}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">{pt.cash}</h4>
            {payments.filter((p) => p.sourceType === "CASH").length === 0 ? (
              <p className="text-xs text-zinc-400">{pt.noCashPayments}</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "CASH")
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">
                        {formatDate(p.paidAt)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-medium text-zinc-900">
                          {formatPaymentAmount(p)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditCash(p)}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          {pt.edit}
                        </button>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">{pt.fopBank}</h4>
            {payments.filter((p) => p.sourceType === "BANK").length === 0 ? (
              <p className="text-xs text-zinc-400">{pt.noBankPayments}</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "BANK")
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">
                        {formatDate(p.paidAt)}
                        {p.bankTransaction?.counterpartyName
                          ? ` · ${p.bankTransaction.counterpartyName}`
                          : ""}
                        {p.sameTransactionOrderNumbers && p.sameTransactionOrderNumbers.length > 1
                          ? ` · Orders: ${p.sameTransactionOrderNumbers.join(", ")}`
                          : ""}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="font-medium text-zinc-900">
                          {formatPaymentAmount(p)}
                        </span>
                        <Link
                          href={`/payments?view=payments&search=${encodeURIComponent(orderNumber)}`}
                          className="text-xs font-medium text-emerald-700 hover:underline"
                        >
                          {pt.inRegistry}
                        </Link>
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">1С</h4>
            {payments.filter((p) => p.sourceType === "ONE_C").length === 0 ? (
              <p className="text-xs text-zinc-400">Немає оплат з 1С</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "ONE_C")
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">
                        {formatDate(p.paidAt)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="font-medium text-zinc-900">{formatPaymentAmount(p)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">{pt.credits}</h4>
            {payments.filter((p) => p.sourceType === "CREDIT").length === 0 ? (
              <p className="text-xs text-zinc-400">{pt.noCredits}</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "CREDIT")
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">
                        {formatDate(p.paidAt)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="shrink-0 font-medium text-zinc-900">
                        {formatPaymentAmount(p)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <div>
            <h4 className="mb-1.5 text-xs font-medium text-zinc-500">{pt.creditTransfers}</h4>
            {payments.filter((p) => p.sourceType === "CREDIT_TRANSFER").length === 0 ? (
              <p className="text-xs text-zinc-400">{pt.noCreditTransfers}</p>
            ) : (
              <ul className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/50 p-2">
                {payments
                  .filter((p) => p.sourceType === "CREDIT_TRANSFER")
                  .map((p) => (
                    <li key={p.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1 text-sm">
                      <span className="min-w-0 flex-1 truncate text-zinc-600">
                        {formatDate(p.paidAt)}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                      <span className="shrink-0 font-medium text-zinc-900">
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

      {editCash && (
        <EditCashPaymentModal
          apiBaseUrl={apiBaseUrl}
          payment={editCash}
          orderNumber={orderNumber}
          isAdmin={userRole === "ADMIN"}
          onClose={() => setEditCash(null)}
          onSaved={async () => {
            setEditCash(null);
            void fetchPayments();
            await Promise.resolve(onSaved?.());
          }}
        />
      )}

      {showTransfer && clientId ? (
        <TransferCreditModal
          apiBaseUrl={apiBaseUrl}
          fromOrderId={orderId}
          clientId={clientId}
          currency={currency}
          exchangeRate={exchangeRate}
          creditAmount={creditAmount}
          onClose={() => setShowTransfer(false)}
          onSaved={async () => {
            setShowTransfer(false);
            void fetchPayments();
            await Promise.resolve(onSaved?.());
          }}
        />
      ) : null}

      {showPayLinkModal && (
        <CreatePaymentLinkModal
          apiBaseUrl={apiBaseUrl}
          orderId={orderId}
          orderNumber={orderNumber}
          currency={currency}
          exchangeRate={exchangeRate}
          debtAmount={debtAmount}
          onClose={() => setShowPayLinkModal(false)}
          onCreated={async () => {
            setShowPayLinkModal(false);
            void fetchPaymentRequests();
            await Promise.resolve(onSaved?.());
          }}
        />
      )}
    </div>
  );
}

function defaultExpiresLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(23, 59, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type CreatePaymentLinkModalProps = {
  apiBaseUrl: string;
  orderId: string;
  orderNumber: string;
  currency: string;
  exchangeRate?: number | null;
  debtAmount: number;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
};

function CreatePaymentLinkModal({
  apiBaseUrl,
  orderId,
  orderNumber,
  currency,
  exchangeRate,
  debtAmount,
  onClose,
  onCreated,
}: CreatePaymentLinkModalProps) {
  const [amount, setAmount] = useState(() => {
    if (debtAmount <= 0) return "";
    if (isForeignOrderCurrency(currency) && exchangeRate != null && exchangeRate > 0) {
      return String((Math.round(debtAmount * exchangeRate * 100) / 100).toFixed(2));
    }
    return String(debtAmount.toFixed(2));
  });
  const [purpose, setPurpose] = useState(() => `Оплата замовлення ${orderNumber}`);
  const [expiresLocal, setExpiresLocal] = useState(defaultExpiresLocal);
  const [receiverCode, setReceiverCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedAmountForPreview = parseFloat(amount.replace(/,/g, "."));
  const orderEquivalent =
    isForeignOrderCurrency(currency) &&
    exchangeRate != null &&
    exchangeRate > 0 &&
    Number.isFinite(parsedAmountForPreview)
      ? Math.round((parsedAmountForPreview / exchangeRate) * 100) / 100
      : null;

  const submit = async () => {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError("Вкажіть суму більше 0");
      return;
    }
    const exp = new Date(expiresLocal);
    if (Number.isNaN(exp.getTime()) || exp <= new Date()) {
      setError("Термін дії має бути в майбутньому");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        amount: num,
        purpose: purpose.trim(),
        expiresAt: exp.toISOString(),
      };
      const rc = receiverCode.replace(/\D/g, "");
      if (rc.length === 8 || rc.length === 10) {
        body.receiverCode = rc;
      } else if (receiverCode.trim()) {
        setError("ЄДРПОУ — 8 цифр, ІПН — 10 цифр (або залиште поле порожнім)");
        setSubmitting(false);
        return;
      }
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/payment-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try {
          const j = JSON.parse(t) as { message?: string | string[] };
          if (typeof j.message === "string") msg = j.message;
          else if (Array.isArray(j.message)) msg = j.message.join(", ");
        } catch {
          /* plain text */
        }
        throw new Error(msg || `HTTP ${r.status}`);
      }
      await onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося створити");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[min(90dvh,40rem)] w-full max-w-md overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-zinc-900">Посилання на оплату</h3>
        <p className="mt-1 text-xs text-zinc-500">
          IBAN і найменування — з рахунку ФОП замовлення. ЄДРПОУ/ІПН — з реквізитів рахунку, компанії замовлення або клієнта; якщо в CRM порожньо — введіть вручну нижче.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600">ЄДРПОУ / ІПН (якщо не підставився автоматично)</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="8 або 10 цифр"
              value={receiverCode}
              onChange={(e) => setReceiverCode(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">
              {isForeignOrderCurrency(currency) || currency === "UAH" ? "Сума платежу (грн)" : `Сума (${currency})`}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
            {isForeignOrderCurrency(currency) ? (
              <p className="mt-1 text-[11px] text-zinc-500">
                Сума в посиланні та QR НБУ — у гривнях (те саме, що ви вводите).
                {exchangeRate != null && exchangeRate > 0 ? (
                  <span className="block">
                    Курс замовлення для довідки: {exchangeRate} ₴ за 1&nbsp;{orderCurrencySymbol(currency)}
                    {orderEquivalent != null ? (
                      <span className="mt-0.5 block font-medium text-zinc-700">
                        ≈ {orderEquivalent.toFixed(2)} {orderCurrencySymbol(currency)}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="block">
                    Додайте курс у замовленні — покажемо еквівалент у {orderCurrencySymbol(currency)}.
                  </span>
                )}
              </p>
            ) : currency === "UAH" ? (
              <p className="mt-1 text-[11px] text-zinc-500">Сума в платіжному посиланні та QR — у гривнях (UAH).</p>
            ) : (
              <p className="mt-1 text-[11px] text-zinc-500">
                Сума та валюта в посиланні/QR відповідають полю вище ({currency}).
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Призначення платежу</label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Дійсне до</label>
            <input
              type="datetime-local"
              value={expiresLocal}
              onChange={(e) => setExpiresLocal(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error ? (
          <div className="mt-2 space-y-1">
            <p className="text-xs text-red-600">{error}</p>
            {isReceiverCodeHintError(error) ? (
              <p className="text-xs text-zinc-600">
                Щоб зберегти ЄДРПОУ/ІПН для всіх посилань: відкрийте{" "}
                <Link href="/settings/fop" className="font-medium text-emerald-800 underline underline-offset-2">
                  Налаштування → Рахунки ФОП
                </Link>
                , оберіть рахунок цього замовлення й заповніть поля «ЄДРПОУ» та/або «ІПН» у реквізитах, потім збережіть. Або введіть код у полі вище.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            Скасувати
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {submitting ? "Створення…" : "Створити посилання"}
          </button>
        </div>
      </div>
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

type DebtOrderOption = {
  id: string;
  orderNumber: string;
  debtAmount: number;
  currency: string;
};

type TransferCreditModalProps = {
  apiBaseUrl: string;
  fromOrderId: string;
  clientId: string;
  currency: string;
  exchangeRate?: number | null;
  creditAmount: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function TransferCreditModal({
  apiBaseUrl,
  fromOrderId,
  clientId,
  currency,
  exchangeRate,
  creditAmount,
  onClose,
  onSaved,
}: TransferCreditModalProps) {
  const [targets, setTargets] = useState<DebtOrderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [toOrderId, setToOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(
          `${apiBaseUrl}/orders?clientId=${encodeURIComponent(clientId)}&hasDebt=true&pageSize=50`,
          { credentials: "include", cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { items?: DebtOrderOption[] };
        const items = (data.items ?? [])
          .filter((o) => o.id !== fromOrderId && Number(o.debtAmount) > 0.009)
          .filter((o) => (o.currency || "").toUpperCase() === currency.toUpperCase());
        if (cancelled) return;
        setTargets(items);
        if (items.length === 1) {
          setToOrderId(items[0].id);
          setAmount(String(Math.min(creditAmount, Number(items[0].debtAmount)).toFixed(2)));
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : pt.transferFailed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, clientId, fromOrderId, currency, creditAmount]);

  const selected = targets.find((t) => t.id === toOrderId);
  const maxTransfer = selected
    ? Math.min(creditAmount, Number(selected.debtAmount))
    : creditAmount;

  const onSelectTarget = (id: string) => {
    setToOrderId(id);
    const t = targets.find((x) => x.id === id);
    if (t) {
      setAmount(String(Math.min(creditAmount, Number(t.debtAmount)).toFixed(2)));
    }
  };

  const submit = async () => {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (!toOrderId) {
      setError(pt.transferTarget);
      return;
    }
    if (!Number.isFinite(num) || num <= 0) {
      setError(pt.enterAmount);
      return;
    }
    if (num > maxTransfer + 0.009) {
      setError(`${pt.transferAmount}: max ${maxTransfer.toFixed(2)}`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/payments/transfer-credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fromOrderId,
          toOrderId,
          amount: num,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try {
          const j = JSON.parse(t) as { message?: string | string[] };
          if (typeof j.message === "string") msg = j.message;
          else if (Array.isArray(j.message)) msg = j.message.join(", ");
        } catch {
          /* plain */
        }
        throw new Error(msg || `HTTP ${r.status}`);
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : pt.transferFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[min(90dvh,32rem)] w-full max-w-sm overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-zinc-900">{pt.transferCreditTitle}</h3>
        <p className="mt-1 text-xs text-zinc-500">
          {pt.overpaymentLabel}: {formatOrderAmount(creditAmount, currency, exchangeRate)}
        </p>
        <div className="mt-3 space-y-3">
          {loading ? (
            <p className="text-xs text-zinc-400">{pt.loading}</p>
          ) : targets.length === 0 ? (
            <p className="text-xs text-zinc-500">{pt.transferNoTargets}</p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{pt.transferTarget}</label>
                <select
                  value={toOrderId}
                  onChange={(e) => onSelectTarget(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.orderNumber} · борг {Number(t.debtAmount).toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{pt.transferAmount}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
                {selected ? (
                  <p className="mt-1 text-[11px] text-zinc-500">
                    max {maxTransfer.toFixed(2)} {currency}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pt.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || loading || targets.length === 0}
            className="rounded-md bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800 disabled:opacity-50"
          >
            {submitting ? pt.transferSubmitting : pt.transferSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}

const CASH_PAYMENT_CURRENCIES = ["USD", "UAH", "EUR"] as const;

function AddCashPaymentModal({
  apiBaseUrl,
  orderId,
  currency,
  onClose,
  onSaved,
}: AddCashPaymentModalProps) {
  const [amount, setAmount] = useState("");
  const [paymentCurrency, setPaymentCurrency] = useState(() =>
    currency && CASH_PAYMENT_CURRENCIES.includes(currency as (typeof CASH_PAYMENT_CURRENCIES)[number])
      ? currency
      : "USD",
  );
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastSubmitAtRef = useRef(0);

  const submit = async (confirmDuplicate = false) => {
    if (submitting) return;
    const now = Date.now();
    if (now - lastSubmitAtRef.current < 500) return;
    lastSubmitAtRef.current = now;

    const num = parseFloat(amount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError(pt.enterAmount);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID();
      }
      const r = await fetch(`${apiBaseUrl}/payments/cash`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        credentials: "include",
        body: JSON.stringify({
          orderId,
          amount: num,
          currency: paymentCurrency,
          paidAt: new Date(paidAt).toISOString(),
          note: note.trim() || undefined,
          ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
        }),
      });
      if (!r.ok) {
        type CashDupExisting = {
          orderNumber?: string | null;
          amount?: number;
          currency?: string;
        };
        type CashPayErrorNested = {
          code?: string;
          message?: string;
          existing?: CashDupExisting;
        };
        type CashPayErrorBody = {
          message?: string | CashPayErrorNested;
          code?: string;
        };
        let body: CashPayErrorBody | null = null;
        try {
          body = (await r.json()) as CashPayErrorBody;
        } catch {
          body = null;
        }
        const nested: CashPayErrorNested | CashPayErrorBody | null =
          body && typeof body.message === "object" && body.message !== null ? body.message : body;
        const dupCode =
          nested && "code" in nested && typeof nested.code === "string" ? nested.code : body?.code;
        const existing: CashDupExisting | undefined =
          nested && "existing" in nested
            ? (nested.existing as CashDupExisting | undefined)
            : undefined;
        if (r.status === 409 && dupCode === "CASH_PAYMENT_DUPLICATE" && !confirmDuplicate) {
          const exLabel = existing
            ? strings.payments.cashDuplicateExisting(
                existing.orderNumber ?? "—",
                `${existing.amount?.toFixed(2) ?? "?"} ${existing.currency ?? ""}`,
              )
            : "";
          if (window.confirm(`${strings.payments.cashDuplicateConfirm}\n${exLabel}`)) {
            setSubmitting(false);
            lastSubmitAtRef.current = 0;
            await submit(true);
            return;
          }
          setError(strings.payments.cashDuplicateConfirm);
          return;
        }
        const nestedMsg =
          nested && "message" in nested && typeof nested.message === "string" ? nested.message : null;
        const msg =
          (typeof body?.message === "string" && body.message) || nestedMsg || `HTTP ${r.status}`;
        throw new Error(msg);
      }
      idempotencyKeyRef.current = null;
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : pt.saveFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[min(90dvh,32rem)] w-full max-w-sm overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-zinc-900">{pt.cashPaymentTitle}</h3>
        <div className="mt-3 space-y-2">
          <div>
            <span className="block text-xs font-medium text-zinc-600">Сума</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <select
                value={paymentCurrency}
                onChange={(e) => setPaymentCurrency(e.target.value)}
                className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                aria-label="Валюта"
              >
                {CASH_PAYMENT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{pt.dateTime}</label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{pt.note}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={pt.noteOptional}
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
            {pt.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? pt.saving : pt.save}
          </button>
        </div>
      </div>
    </div>
  );
}

type EditCashPaymentModalProps = {
  apiBaseUrl: string;
  payment: PaymentItem;
  orderNumber: string;
  isAdmin?: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function EditCashPaymentModal({
  apiBaseUrl,
  payment,
  orderNumber,
  isAdmin = false,
  onClose,
  onSaved,
}: EditCashPaymentModalProps) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [paymentCurrency, setPaymentCurrency] = useState(() =>
    CASH_PAYMENT_CURRENCIES.includes(payment.currency as (typeof CASH_PAYMENT_CURRENCIES)[number])
      ? payment.currency
      : "USD",
  );
  const [paidAt, setPaidAt] = useState(() => new Date(payment.paidAt).toISOString().slice(0, 16));
  const [note, setNote] = useState(payment.note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deletePayment = async () => {
    const amountLabel = formatPaymentAmount(payment);
    if (!window.confirm(`Видалити готівкову оплату ${amountLabel} по замовленню ${orderNumber}?`)) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/payments/${payment.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await Promise.resolve(onSaved());
    } catch (e) {
      setError(e instanceof Error ? e.message : pt.saveFailed);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    const num = parseFloat(amount.replace(/,/g, "."));
    if (!Number.isFinite(num) || num <= 0) {
      setError(pt.enterAmount);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/payments/${payment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount: num,
          currency: paymentCurrency,
          paidAt: new Date(paidAt).toISOString(),
          note: note.trim() || undefined,
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || `HTTP ${r.status}`);
      }
      await Promise.resolve(onSaved());
    } catch (e) {
      setError(e instanceof Error ? e.message : pt.saveFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[min(90dvh,32rem)] w-full max-w-sm overflow-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg">
        <h3 className="text-sm font-semibold text-zinc-900">{pt.editCashPaymentTitle}</h3>
        <div className="mt-3 space-y-2">
          <div>
            <span className="block text-xs font-medium text-zinc-600">{pt.amount}</span>
            <div className="mt-1 flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <select
                value={paymentCurrency}
                onChange={(e) => setPaymentCurrency(e.target.value)}
                className="shrink-0 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
                aria-label={pt.currency}
              >
                {CASH_PAYMENT_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{pt.dateTime}</label>
            <input
              type="datetime-local"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">{pt.note}</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={pt.noteOptional}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => void deletePayment()}
              disabled={submitting}
              className="mr-auto rounded-md border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Видалити
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {pt.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? pt.saving : pt.save}
          </button>
        </div>
      </div>
    </div>
  );
}
