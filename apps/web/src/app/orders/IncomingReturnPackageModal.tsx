"use client";

import { useEffect, useMemo, useState } from "react";
import {
  returnPackagesApi,
  type ReturnPackageLineSuggestion,
} from "@/lib/api/resources/return-packages";
import { listWarehouses, type WarehouseItem } from "@/lib/api/resources/warehouses";
import { strings } from "@/locales";

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
};

type SelectedLine = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  productSku: string | null;
  clientLabel: string;
  qty: number;
  max: number;
};

function suggestionClient(row: ReturnPackageLineSuggestion): string {
  if (row.client) {
    return `${row.client.lastName ?? ""} ${row.client.firstName ?? ""}`.trim();
  }
  return row.company?.name ?? "";
}

export function IncomingReturnPackageModal({
  open,
  onClose,
  onCreated,
  defaultOrderId,
  defaultContactId,
  defaultWarehouseId,
  contactSearch,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultOrderId?: string;
  defaultContactId?: string;
  defaultWarehouseId?: string;
  contactSearch?: (q: string) => Promise<ContactOption[]>;
}) {
  const [ttnNumber, setTtnNumber] = useState("");
  const [note, setNote] = useState("");
  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId ?? "");
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [contactId, setContactId] = useState(defaultContactId ?? "");
  const [contactOptions, setContactOptions] = useState<ContactOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ReturnPackageLineSuggestion[]>([]);
  const [suggestionsScoped, setSuggestionsScoped] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [selectedLines, setSelectedLines] = useState<SelectedLine[]>([]);

  const linesByOrder = useMemo(() => {
    const groups = new Map<string, SelectedLine[]>();
    for (const line of selectedLines) {
      const bucket = groups.get(line.orderId) ?? [];
      bucket.push(line);
      groups.set(line.orderId, bucket);
    }
    return [...groups.entries()];
  }, [selectedLines]);

  useEffect(() => {
    if (!open) return;
    setWarehouseId(defaultWarehouseId ?? "");
    setProductQuery("");
    setSuggestions([]);
    setSuggestionsScoped(false);
    setSelectedLines([]);
    void listWarehouses()
      .then(setWarehouses)
      .catch(() => setWarehouses([]));
  }, [open, defaultWarehouseId]);

  useEffect(() => {
    if (!open) return;
    const q = productQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestionsScoped(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSuggestionsLoading(true);
      void returnPackagesApi
        .suggestLinesPreview({
          q,
          contactId: contactId || undefined,
          limit: 20,
        })
        .then((data) => {
          setSuggestions(data.items ?? []);
          setSuggestionsScoped(Boolean(data.scopedToContact));
        })
        .catch(() => {
          setSuggestions([]);
          setSuggestionsScoped(false);
        })
        .finally(() => setSuggestionsLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [open, productQuery, contactId]);

  if (!open) return null;

  const t = strings.orders.modal;
  const tr = strings.returns;

  const searchContacts = async () => {
    if (!contactSearch || contactQuery.trim().length < 2) return;
    setSearching(true);
    try {
      const list = await contactSearch(contactQuery.trim());
      setContactOptions(list);
    } catch {
      setContactOptions([]);
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    const ttn = ttnNumber.replace(/\s+/g, "").trim();
    if (ttn.length < 4) {
      setErr("Вкажіть номер ТТН");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const lines = selectedLines.map((line) => ({
        orderId: line.orderId,
        orderItemId: line.orderItemId,
        qtyReturned: line.qty,
      }));
      await returnPackagesApi.create({
        ttnNumber: ttn,
        contactId: contactId || undefined,
        orderId: lines.length === 0 ? defaultOrderId : undefined,
        note: note.trim() || undefined,
        warehouseId: warehouseId || undefined,
        itemsPending: lines.length === 0 ? !!defaultOrderId : undefined,
        lines: lines.length > 0 ? lines : undefined,
      });
      setTtnNumber("");
      setNote("");
      setContactQuery("");
      setContactId(defaultContactId ?? "");
      setWarehouseId(defaultWarehouseId ?? "");
      setContactOptions([]);
      setProductQuery("");
      setSuggestions([]);
      setSelectedLines([]);
      onCreated?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не вдалося створити посилку");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (submitting) return;
        onClose();
      }}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 pt-5">
          <h3 className="text-base font-semibold text-zinc-900">{t.incomingReturnPackageTitle}</h3>
          <p className="mt-1 text-sm text-zinc-600">{t.incomingReturnPackageHint}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1">

        <label className="mt-4 block text-sm font-medium text-zinc-700">
          {t.returnTtnLabel}
          <input
            type="text"
            value={ttnNumber}
            onChange={(e) => setTtnNumber(e.target.value)}
            placeholder="20450000000000"
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="mt-3 block text-sm font-medium text-zinc-700">
          {tr.returnWarehouseLabel}
          <select
            value={warehouseId}
            onChange={(e) => setWarehouseId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">{t.notSpecified}</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>

        {contactSearch ? (
          <div className="mt-3">
            <label className="block text-sm font-medium text-zinc-700">{t.returnContactHint}</label>
            <div className="mt-1 flex gap-2">
              <input
                type="search"
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={searching}
                onClick={() => void searchContacts()}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm hover:bg-zinc-50"
              >
                Пошук
              </button>
            </div>
            {contactOptions.length > 0 ? (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {contactOptions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setContactId(c.id)}
                    className={`block w-full rounded border px-2 py-1.5 text-left text-sm ${
                      contactId === c.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
                    }`}
                  >
                    {c.lastName} {c.firstName} · {c.phone}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/60 p-3">
          <div className="text-sm font-medium text-zinc-800">Позиції</div>
          <p className="mt-1 text-xs text-zinc-600">
            Введіть SKU або назву. Підказка покаже, з якого замовлення ця позиція.
          </p>
          <input
            type="search"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
            placeholder="SKU або назва товару…"
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          {suggestionsLoading ? (
            <p className="mt-2 text-xs text-zinc-500">Шукаємо замовлення…</p>
          ) : suggestions.length > 0 ? (
            <div className="mt-2 space-y-2">
              {suggestionsScoped ? (
                <p className="text-[11px] text-sky-800">Спочатку замовлення обраного клієнта</p>
              ) : contactId ? (
                <p className="text-[11px] text-amber-800">
                  У цього клієнта збігів немає — показані інші замовлення
                </p>
              ) : null}
              {suggestions.map((row) => {
                const added = selectedLines.some((line) => line.orderItemId === row.orderItemId);
                const client = suggestionClient(row);
                return (
                  <div
                    key={row.orderItemId}
                    className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  >
                    <div className="font-medium text-zinc-900">
                      {row.productSku ? `${row.productSku} · ` : ""}
                      {row.productName}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-600">
                      Замовлення {row.orderNumber}
                      {client ? ` · ${client}` : ""}
                      {" · "}
                      можна {row.returnableQty} з {row.qtyOrdered}
                    </div>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() =>
                        setSelectedLines((prev) =>
                          prev.some((line) => line.orderItemId === row.orderItemId)
                            ? prev
                            : [
                                ...prev,
                                {
                                  orderItemId: row.orderItemId,
                                  orderId: row.orderId,
                                  orderNumber: row.orderNumber,
                                  productName: row.productName,
                                  productSku: row.productSku ?? null,
                                  clientLabel: client,
                                  qty: row.returnableQty,
                                  max: row.returnableQty,
                                },
                              ],
                        )
                      }
                      className="mt-2 rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {added ? "Додано" : "Додати з цього замовлення"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : productQuery.trim().length >= 2 ? (
            <p className="mt-2 text-xs text-zinc-500">Нічого не знайдено</p>
          ) : null}

          {linesByOrder.length > 0 ? (
            <div className="mt-3 space-y-3">
              {linesByOrder.map(([orderId, lines]) => (
                <div key={orderId}>
                  <div className="text-xs font-medium text-zinc-700">
                    Замовлення {lines[0]?.orderNumber}
                    {lines[0]?.clientLabel ? ` · ${lines[0].clientLabel}` : ""}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {lines.map((line) => (
                      <li
                        key={line.orderItemId}
                        className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-800">
                          {line.productSku ? `${line.productSku} · ` : ""}
                          {line.productName}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={line.max}
                          value={line.qty}
                          onChange={(e) => {
                            const next = Math.min(
                              line.max,
                              Math.max(1, Math.floor(Number(e.target.value) || 1)),
                            );
                            setSelectedLines((prev) =>
                              prev.map((row) =>
                                row.orderItemId === line.orderItemId ? { ...row, qty: next } : row,
                              ),
                            );
                          }}
                          className="w-16 rounded border border-zinc-300 px-1.5 py-1 text-right text-sm tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedLines((prev) =>
                              prev.filter((row) => row.orderItemId !== line.orderItemId),
                            )
                          }
                          className="text-xs text-zinc-500 hover:text-zinc-800"
                        >
                          Прибрати
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <label className="mt-3 block text-sm font-medium text-zinc-700">
          Примітка
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </label>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-100 px-5 py-4">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {strings.common.cancel}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {submitting ? "…" : t.createIncomingPackage}
          </button>
        </div>
      </div>
    </div>
  );
}
