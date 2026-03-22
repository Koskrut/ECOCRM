"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getOrder, getOrders } from "@/lib/api";
import {
  deliveryMethodLabel,
  formatCabinetLineMoney,
  formatCabinetMoney,
  formatCabinetDateShort,
  orderStatusLabel,
  paymentMethodLabel,
} from "@/lib/cabinet-utils";

const PAGE_SIZE = 10;

export default function CabinetOrdersPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrders>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [sheetOrderId, setSheetOrderId] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<Awaited<ReturnType<typeof getOrder>> | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const sheetRequestRef = useRef(0);

  useEffect(() => {
    getOrders(page, PAGE_SIZE)
      .then(setData)
      .catch(() => setErr("Не вдалося завантажити замовлення"))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    if (!sheetOrderId) {
      setSheetData(null);
      setSheetErr(null);
      setSheetLoading(false);
      return;
    }
    const req = ++sheetRequestRef.current;
    setSheetLoading(true);
    setSheetErr(null);
    setSheetData(null);
    getOrder(sheetOrderId)
      .then((order) => {
        if (sheetRequestRef.current !== req) return;
        setSheetData(order);
      })
      .catch(() => {
        if (sheetRequestRef.current !== req) return;
        setSheetErr("Не вдалося завантажити склад замовлення");
      })
      .finally(() => {
        if (sheetRequestRef.current === req) setSheetLoading(false);
      });
  }, [sheetOrderId]);

  useEffect(() => {
    if (!sheetOrderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOrderId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOrderId]);

  if (err) {
    return (
      <div>
        <p className="text-red-600">{err}</p>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div>
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-200" />
          ))}
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Мої замовлення
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Всього: {data.total} {data.total === 1 ? "замовлення" : "замовлень"}
      </p>

      {data.items.length ? (
        <>
          <ul className="mt-6 space-y-3">
            {data.items.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSheetOrderId(o.id)}
                  className="w-full rounded-xl border border-[var(--border)] bg-white p-4 text-left shadow-sm transition hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-zinc-900">{o.orderNumber}</span>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-sm text-zinc-600">
                      {orderStatusLabel(o.status)}
                    </span>
                    <span className="text-sm text-zinc-500">
                      {formatCabinetDateShort(o.createdAt)}
                    </span>
                    <span className="ml-auto font-medium">
                      {formatCabinetMoney(o.totalAmount, o.currency, o.exchangeRate)}
                    </span>
                  </div>
                  {(o.deliveryMethod || o.paymentMethod) && (
                    <p className="mt-2 text-xs text-zinc-500">
                      {[deliveryMethodLabel(o.deliveryMethod), paymentMethodLabel(o.paymentMethod)]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[var(--primary)]">Товари · натисніть</p>
                </button>
              </li>
            ))}
          </ul>

          {sheetOrderId ? (
            <div className="fixed inset-0 z-50 flex flex-col justify-end" role="presentation">
              <button
                type="button"
                aria-label="Закрити"
                className="absolute inset-0 bg-black/40"
                onClick={() => setSheetOrderId(null)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="order-sheet-title"
                className="cabinet-order-sheet-panel relative max-h-[min(78vh,640px)] w-full overflow-hidden rounded-t-2xl border border-[var(--border)] border-b-0 bg-white shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <h2 id="order-sheet-title" className="font-heading text-lg font-semibold text-zinc-900">
                    {sheetData?.orderNumber ?? "Замовлення"}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setSheetOrderId(null)}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                  >
                    Закрити
                  </button>
                </div>
                <div className="max-h-[calc(min(78vh,640px)-52px)] overflow-y-auto px-4 pb-6 pt-3">
                  {sheetLoading && (
                    <div className="space-y-3">
                      <div className="h-14 animate-pulse rounded-lg bg-zinc-200" />
                      <div className="h-14 animate-pulse rounded-lg bg-zinc-200" />
                    </div>
                  )}
                  {sheetErr && <p className="text-sm text-red-600">{sheetErr}</p>}
                  {!sheetLoading && !sheetErr && sheetData && (
                    <>
                      <ul className="space-y-2">
                        {sheetData.items.map((i) => (
                          <li
                            key={i.id}
                            className="flex justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                          >
                            <span className="text-zinc-900">
                              {i.name}
                              {i.sku ? <span className="text-zinc-500"> ({i.sku})</span> : null}
                            </span>
                            <span className="shrink-0 text-zinc-600">
                              {i.qty} ×{" "}
                              {formatCabinetLineMoney(
                                i.price,
                                sheetData.currency,
                                sheetData.exchangeRate,
                              )}{" "}
                              ={" "}
                              {formatCabinetLineMoney(
                                i.lineTotal,
                                sheetData.currency,
                                sheetData.exchangeRate,
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {sheetData.items.length === 0 && (
                        <p className="text-sm text-zinc-500">Позицій у замовленні немає.</p>
                      )}
                      <Link
                        href={`/cabinet/orders/${sheetData.id}`}
                        prefetch={false}
                        className="mt-4 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
                        onClick={() => setSheetOrderId(null)}
                      >
                        Повна сторінка замовлення →
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-center gap-2"
              aria-label="Пагінація замовлень"
            >
              {hasPrev && (
                <Link
                  href={`/cabinet/orders?page=${page - 1}`}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-[var(--surface)]"
                >
                  ← Назад
                </Link>
              )}
              <span className="text-sm text-zinc-500">
                Сторінка {page} з {totalPages}
              </span>
              {hasNext && (
                <Link
                  href={`/cabinet/orders?page=${page + 1}`}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-[var(--surface)]"
                >
                  Далі →
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <p className="mt-6 text-zinc-500">Замовлень поки немає.</p>
      )}
    </div>
  );
}
