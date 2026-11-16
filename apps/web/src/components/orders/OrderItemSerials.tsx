"use client";

import { useRef, useState } from "react";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { ordersApi, type OrderItemSerial } from "@/lib/api/resources/orders";
import { strings } from "@/locales";

const SERIAL_LOCKED_STAGES = new Set([
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
]);

export function orderSerialsEditable(stage: string | null | undefined): boolean {
  if (!stage) return true;
  return !SERIAL_LOCKED_STAGES.has(stage);
}

type OrderItemSerialsProps = {
  orderId: string;
  itemId: string;
  requiredQty: number;
  serials: OrderItemSerial[];
  editable: boolean;
  /** Inline field under the line. The warehouse pick screen uses one shared scanner instead. */
  showInput?: boolean;
  autoFocus?: boolean;
  onChange: (serials: OrderItemSerial[]) => void;
};

export function OrderItemSerials({
  orderId,
  itemId,
  requiredQty,
  serials,
  editable,
  showInput = true,
  autoFocus = false,
  onChange,
}: OrderItemSerialsProps) {
  const t = strings.orders.modal;
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const complete = requiredQty > 0 && serials.length === requiredQty;
  const canScan = editable && showInput && requiredQty > 0 && serials.length < requiredQty;

  async function submit(raw: string) {
    const serial = raw.trim();
    if (!serial || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await ordersApi.addItemSerial(orderId, itemId, serial);
      onChange(next);
      setValue("");
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.serialSaveError));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function remove(serialId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await ordersApi.removeItemSerial(orderId, itemId, serialId);
      onChange(next);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.serialSaveError));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  if (requiredQty <= 0 && serials.length === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium text-zinc-600">{t.serialsTitle}</span>
        {requiredQty > 0 ? (
          <span
            className={`tabular-nums ${complete ? "text-emerald-700" : "text-amber-700"}`}
          >
            {t.serialsProgress(serials.length, requiredQty)}
          </span>
        ) : null}
      </div>
      {serials.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {serials.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-800"
            >
              <span>{s.serial}</span>
              {editable ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(s.id)}
                  className="text-zinc-400 hover:text-red-600 disabled:opacity-50"
                  aria-label={t.serialRemove}
                  title={t.serialRemove}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canScan ? (
        <input
          ref={inputRef}
          value={value}
          autoFocus={autoFocus}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={busy}
          placeholder={t.serialScanPlaceholder}
          aria-label={t.serialScanPlaceholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== "Tab") return;
            e.preventDefault();
            void submit(e.currentTarget.value);
          }}
          className="mt-1.5 w-full max-w-sm rounded-md border border-zinc-300 px-2 py-1.5 font-mono text-sm focus:border-zinc-900 focus:outline-none disabled:opacity-50"
        />
      ) : null}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
