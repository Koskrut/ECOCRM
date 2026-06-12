"use client";

import { useCallback, useEffect, useState } from "react";
import { formatOrderAmount } from "@/lib/formatOrderAmount";

type SettlementPreview = {
  returnId: string;
  currency: string;
  returnAmount: number;
  overpaymentAfterClose: number;
  maxSettleAmount: number;
  requiresSettlement: boolean;
};

type SettlementType = "CREDIT" | "REFUND" | "SPLIT";

export function OrderReturnSettlementDialog({
  returnId,
  currency,
  onConfirm,
  onCancel,
}: {
  returnId: string;
  currency: string;
  onConfirm: (payload: {
    type: SettlementType;
    creditAmount?: number;
    refundAmount?: number;
  }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [type, setType] = useState<SettlementType>("CREDIT");
  const [creditAmount, setCreditAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch(`/api/order-returns/${returnId}/settlement-preview`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error((body as { message?: string }).message ?? `Помилка (${r.status})`);
        }
        const data = (await r.json()) as SettlementPreview;
        if (cancelled) return;
        setPreview(data);
        const max = String(data.maxSettleAmount ?? 0);
        setCreditAmount(max);
        setRefundAmount("0");
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Помилка завантаження");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [returnId]);

  const max = preview?.maxSettleAmount ?? 0;
  const cur = preview?.currency ?? currency;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const credit = Number(creditAmount) || 0;
      const refund = Number(refundAmount) || 0;
      if (type === "CREDIT") {
        await onConfirm({ type: "CREDIT", creditAmount: credit });
      } else if (type === "REFUND") {
        await onConfirm({ type: "REFUND", refundAmount: refund });
      } else {
        await onConfirm({ type: "SPLIT", creditAmount: credit, refundAmount: refund });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-zinc-900">Розрахунок переплати</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Після закриття повернення на замовленні залишилась переплата. Оберіть, як її оформити.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-zinc-500">Завантаження…</p>
        ) : err ? (
          <p className="mt-4 text-sm text-red-600">{err}</p>
        ) : preview ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              <div>Сума повернення: {formatOrderAmount(preview.returnAmount, cur)}</div>
              <div>Переплата: {formatOrderAmount(preview.overpaymentAfterClose, cur)}</div>
              <div className="font-medium">
                Макс. до рознесення: {formatOrderAmount(preview.maxSettleAmount, cur)}
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settlement-type"
                  checked={type === "CREDIT"}
                  onChange={() => setType("CREDIT")}
                />
                Залік на наступне замовлення
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settlement-type"
                  checked={type === "REFUND"}
                  onChange={() => setType("REFUND")}
                />
                Повернення коштів клієнту
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="settlement-type"
                  checked={type === "SPLIT"}
                  onChange={() => setType("SPLIT")}
                />
                Частково залік + частково повернення
              </label>
            </div>

            {(type === "CREDIT" || type === "SPLIT") && (
              <div>
                <label className="text-xs text-zinc-500">Сума заліку</label>
                <input
                  type="number"
                  min={0}
                  max={max}
                  step="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}

            {(type === "REFUND" || type === "SPLIT") && (
              <div>
                <label className="text-xs text-zinc-500">Сума повернення коштів</label>
                <input
                  type="number"
                  min={0}
                  max={max}
                  step="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
                />
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Скасувати
          </button>
          <button
            type="button"
            disabled={loading || !!err || submitting || !preview}
            onClick={() => void handleSubmit()}
            className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "Збереження…" : "Закрити повернення"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function OrderClientBalancePanel({
  orderId,
  currency,
  debtAmount,
  exchangeRate,
  onApplied,
}: {
  orderId: string;
  currency: string;
  debtAmount: number;
  exchangeRate?: number | null;
  onApplied?: () => void | Promise<void>;
}) {
  const [balances, setBalances] = useState<Array<{ currency: string; amount: number }>>([]);
  const [overpayment, setOverpayment] = useState(0);
  const [loading, setLoading] = useState(true);
  const [applyAmount, setApplyAmount] = useState("");
  const [applying, setApplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/client-balances/orders/${orderId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) return;
      const data = (await r.json()) as {
        balances?: Array<{ currency: string; amount: number }>;
        overpayment?: number;
      };
      setBalances(data.balances ?? []);
      setOverpayment(Number(data.overpayment ?? 0));
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const curBalance =
    balances.find((b) => b.currency.toUpperCase() === currency.toUpperCase())?.amount ?? 0;
  const canApply = curBalance > 0.009 && debtAmount > 0.009;

  if (loading) return null;
  if (curBalance <= 0.009 && overpayment <= 0.009) return null;

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
      {curBalance > 0.009 && (
        <div className="font-medium">
          Баланс клієнта: {formatOrderAmount(curBalance, currency, exchangeRate)}
        </div>
      )}
      {overpayment > 0.009 && (
        <div className="text-xs text-sky-800">
          Переплата по замовленню: {formatOrderAmount(overpayment, currency, exchangeRate)}
        </div>
      )}
      {canApply && (
        <div className="mb-3 mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-sky-800">Застосувати залік</label>
            <input
              type="number"
              min={0.01}
              max={Math.min(curBalance, debtAmount)}
              step="0.01"
              value={applyAmount}
              onChange={(e) => setApplyAmount(e.target.value)}
              placeholder={String(Math.min(curBalance, debtAmount).toFixed(2))}
              className="mt-0.5 w-28 rounded border border-sky-300 bg-white px-2 py-1 text-sm"
            />
          </div>
          <button
            type="button"
            disabled={applying}
            onClick={async () => {
              const amount = Number(applyAmount);
              if (!Number.isFinite(amount) || amount <= 0) {
                setErr("Вкажіть суму");
                return;
              }
              setApplying(true);
              setErr(null);
              try {
                const r = await fetch(`/api/client-balances/orders/${orderId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({ amount }),
                });
                if (!r.ok) {
                  const body = await r.json().catch(() => ({}));
                  throw new Error((body as { message?: string }).message ?? "Помилка");
                }
                setApplyAmount("");
                await load();
                await onApplied?.();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Помилка");
              } finally {
                setApplying(false);
              }
            }}
            className="rounded border border-sky-400 bg-white px-2 py-1 text-xs font-medium hover:bg-sky-100 disabled:opacity-50"
          >
            {applying ? "…" : "Застосувати"}
          </button>
          {err && <span className="text-xs text-red-600">{err}</span>}
        </div>
      )}
    </div>
  );
}
