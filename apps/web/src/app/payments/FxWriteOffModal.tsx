import { useState } from "react";
import { ordersApi } from "@/lib/api/resources/orders";
import type { FxVarianceSnapshot } from "@/lib/api/resources/orders";
import { strings as t } from "@/locales";

export type FxWriteOffModalOrder = {
  id: string;
  orderNumber: string;
  currency: string;
  exchangeRate?: number | null;
  fxVariance: FxVarianceSnapshot;
};

type Props = {
  order: FxWriteOffModalOrder;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function FxWriteOffModal({ order, open, onClose, onSuccess }: Props) {
  const [note, setNote] = useState("");
  const [autoComplete, setAutoComplete] = useState(order.fxVariance.canAutoComplete);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const snap = order.fxVariance;
  const debtUah =
    order.exchangeRate && Number(order.exchangeRate) > 0
      ? Math.round(snap.debtUsd * Number(order.exchangeRate))
      : null;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await ordersApi.writeOffFxVariance(order.id, {
        note: note.trim(),
        autoComplete,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.payments.fxVariance.errors.writeOffFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">
          {t.payments.fxVariance.modalTitle}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {t.payments.fxVariance.modalOrder(order.orderNumber)}
        </p>

        <dl className="mt-4 space-y-2 rounded-lg bg-zinc-50 p-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t.payments.fxVariance.expectedUah}</dt>
            <dd className="tabular-nums font-medium">{Math.round(snap.expectedUah)} ₴</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t.payments.fxVariance.paidUah}</dt>
            <dd className="tabular-nums font-medium">{Math.round(snap.paidUah)} ₴</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-500">{t.payments.fxVariance.residualUah}</dt>
            <dd className="tabular-nums font-medium">{Math.round(snap.residualUah)} ₴</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2">
            <dt className="text-zinc-500">{t.payments.fxVariance.debtUsd}</dt>
            <dd className="tabular-nums font-semibold text-zinc-900">
              {snap.debtUsd.toFixed(2)} {order.currency}
              {debtUah != null ? ` (≈${debtUah} ₴)` : ""}
            </dd>
          </div>
        </dl>

        <label className="mt-4 block text-sm">
          <span className="font-medium text-zinc-700">{t.payments.fxVariance.noteLabel}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            placeholder={t.payments.fxVariance.notePlaceholder}
          />
        </label>

        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={autoComplete}
            disabled={!snap.canAutoComplete}
            onChange={(e) => setAutoComplete(e.target.checked)}
          />
          {t.payments.fxVariance.autoCompleteLabel}
        </label>
        {!snap.canAutoComplete && (
          <p className="mt-1 text-xs text-zinc-500">{t.payments.fxVariance.autoCompleteDisabled}</p>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {t.common.cancel}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || note.trim().length < 5}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? t.payments.fxVariance.submitting : t.payments.fxVariance.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
