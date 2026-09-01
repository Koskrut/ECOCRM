"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type OrderSortBy = "createdAt" | "totalAmount" | "status" | "orderNumber" | "orderStage";
export type OrderSortDir = "asc" | "desc";
export type OrderPaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERPAID";
export type HasTtnFilter = "" | "true" | "false";

export type OrdersFiltersState = {
  orderStage: string;
  status: string;
  ownerId: string;
  amountFrom: string;
  amountTo: string;
  dateFrom: string;
  dateTo: string;
  paymentType: string;
  paymentStatus: string;
  hasTtn: HasTtnFilter;
  sortBy: OrderSortBy;
  sortDir: OrderSortDir;
};

export type OwnerOption = {
  id: string;
  fullName: string;
};

type Props = {
  open: boolean;
  value: OrdersFiltersState;
  ownerOptions: OwnerOption[];
  /** Phase 3: primary stage filter (orderStage) */
  orderStageOptions: { value: string; label: string }[];
  /** Hide fields that the current orders view does not apply. */
  variant?: "orders" | "financial" | "returns";
  onClose: () => void;
  onApply: (next: OrdersFiltersState) => void;
  onReset: () => void;
};

function normalizeFilterDraft(draft: OrdersFiltersState): OrdersFiltersState {
  let { amountFrom, amountTo, dateFrom, dateTo } = draft;
  const fromN = Number(amountFrom);
  const toN = Number(amountTo);
  if (
    amountFrom !== "" &&
    amountTo !== "" &&
    Number.isFinite(fromN) &&
    Number.isFinite(toN) &&
    fromN > toN
  ) {
    [amountFrom, amountTo] = [amountTo, amountFrom];
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    [dateFrom, dateTo] = [dateTo, dateFrom];
  }
  return { ...draft, amountFrom, amountTo, dateFrom, dateTo };
}

const SORT_BY_OPTIONS: { value: OrderSortBy; label: string }[] = [
  { value: "createdAt", label: "Дата" },
  { value: "totalAmount", label: "Сума" },
  { value: "orderStage", label: "Стадія" },
  { value: "orderNumber", label: "Номер" },
];

const PAYMENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Будь-який тип" },
  { value: "PREPAYMENT", label: "Передоплата" },
  { value: "DEFERRED", label: "Відтермінування" },
];

const PAYMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Будь-який статус оплати" },
  { value: "UNPAID", label: "Не оплачено" },
  { value: "PARTIALLY_PAID", label: "Частково оплачено" },
  { value: "PAID", label: "Оплачено" },
  { value: "OVERPAID", label: "Переплата" },
];

const TTN_OPTIONS: { value: HasTtnFilter; label: string }[] = [
  { value: "", label: "ТТН: будь-яка" },
  { value: "true", label: "ТТН є" },
  { value: "false", label: "ТТН немає" },
];

export function OrdersFiltersPopover({
  open,
  value,
  ownerOptions,
  orderStageOptions,
  variant = "orders",
  onClose,
  onApply,
  onReset,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const suppressOutsideCloseRef = useRef(false);
  const [draft, setDraft] = useState<OrdersFiltersState>(value);
  const showOrderFields = variant !== "returns";
  const showSort = variant === "orders";

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (evt: MouseEvent) => {
      if (suppressOutsideCloseRef.current) return;
      const target = evt.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose, open]);

  const holdOutsideClose = () => {
    suppressOutsideCloseRef.current = true;
  };
  const releaseOutsideClose = () => {
    window.setTimeout(() => {
      suppressOutsideCloseRef.current = false;
    }, 400);
  };

  const hasActiveFilters = useMemo(() => {
    if (variant === "returns") {
      return Boolean(draft.ownerId || draft.dateFrom || draft.dateTo);
    }
    return Boolean(
      draft.orderStage ||
        draft.ownerId ||
        draft.amountFrom ||
        draft.amountTo ||
        draft.dateFrom ||
        draft.dateTo ||
        draft.paymentType ||
        draft.paymentStatus ||
        draft.hasTtn ||
        (showSort && (draft.sortBy !== "createdAt" || draft.sortDir !== "desc")),
    );
  }, [draft, showSort, variant]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-12 z-30 w-[min(92vw,680px)] rounded-xl border border-zinc-200 bg-white p-4 shadow-xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Фильтр заказов</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
        >
          Закрити
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {showOrderFields ? (
          <select
            value={draft.orderStage}
            onChange={(e) => setDraft((p) => ({ ...p, orderStage: e.target.value }))}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            aria-label="Стадія замовлення"
          >
            {orderStageOptions.map((opt) => (
              <option key={opt.value || "_all"} value={opt.value}>
                {opt.value ? opt.label : "Усі стадії"}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={draft.ownerId}
          onChange={(e) => setDraft((p) => ({ ...p, ownerId: e.target.value }))}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Будь-який відповідальний</option>
          {ownerOptions.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.fullName}
            </option>
          ))}
        </select>

        {showOrderFields ? (
          <>
            <select
              value={draft.paymentType}
              onChange={(e) => setDraft((p) => ({ ...p, paymentType: e.target.value }))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {PAYMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value || "_all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={draft.paymentStatus}
              onChange={(e) => setDraft((p) => ({ ...p, paymentStatus: e.target.value }))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {PAYMENT_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || "_all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={draft.hasTtn}
              onChange={(e) => setDraft((p) => ({ ...p, hasTtn: e.target.value as HasTtnFilter }))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {TTN_OPTIONS.map((opt) => (
                <option key={opt.value || "_all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                inputMode="decimal"
                placeholder="Сума від"
                value={draft.amountFrom}
                onChange={(e) => setDraft((p) => ({ ...p, amountFrom: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                type="number"
                inputMode="decimal"
                placeholder="Сума до"
                value={draft.amountTo}
                onChange={(e) => setDraft((p) => ({ ...p, amountTo: e.target.value }))}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </>
        ) : null}

        <input
          type="date"
          value={draft.dateFrom}
          onChange={(e) => setDraft((p) => ({ ...p, dateFrom: e.target.value }))}
          onFocus={holdOutsideClose}
          onBlur={releaseOutsideClose}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          aria-label="Дата від"
        />
        <input
          type="date"
          value={draft.dateTo}
          onChange={(e) => setDraft((p) => ({ ...p, dateTo: e.target.value }))}
          onFocus={holdOutsideClose}
          onBlur={releaseOutsideClose}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          aria-label="Дата до"
        />

        {showSort ? (
          <>
            <select
              value={draft.sortBy}
              onChange={(e) => setDraft((p) => ({ ...p, sortBy: e.target.value as OrderSortBy }))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              {SORT_BY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Сортировка: {opt.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setDraft((p) => ({ ...p, sortDir: p.sortDir === "asc" ? "desc" : "asc" }))
              }
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
            >
              {draft.sortDir === "asc" ? "За зростанням" : "За спаданням"}
            </button>
          </>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onApply(normalizeFilterDraft(draft));
            onClose();
          }}
          className="btn-primary"
        >
          Применить
        </button>
        <button
          type="button"
          onClick={() => {
            onReset();
            onClose();
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
        >
          Сбросить
        </button>
        <span className="text-xs text-zinc-500">{hasActiveFilters ? "Є активні фільтри" : "Фільтри не вибрані"}</span>
      </div>
    </div>
  );
}
