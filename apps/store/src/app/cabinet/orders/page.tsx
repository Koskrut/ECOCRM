"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getOrders } from "@/lib/api";
import { orderStatusLabel } from "@/lib/cabinet-utils";
import { formatCabinetDateShort } from "@/lib/cabinet-utils";

const PAGE_SIZE = 10;

export default function CabinetOrdersPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [data, setData] = useState<Awaited<ReturnType<typeof getOrders>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getOrders(page, PAGE_SIZE)
      .then(setData)
      .catch(() => setErr("Не вдалося завантажити замовлення"))
      .finally(() => setLoading(false));
  }, [page]);

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
              <li
                key={o.id}
                className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/cabinet/orders/${o.id}`}
                    prefetch={false}
                    className="font-medium text-zinc-900 hover:text-[var(--primary)]"
                  >
                    {o.orderNumber}
                  </Link>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-sm text-zinc-600">
                    {orderStatusLabel(o.status)}
                  </span>
                  <span className="text-sm text-zinc-500">
                    {formatCabinetDateShort(o.createdAt)}
                  </span>
                  <span className="ml-auto font-medium">{o.totalAmount} грн</span>
                </div>
                {(o.deliveryMethod || o.paymentMethod) && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {[o.deliveryMethod, o.paymentMethod].filter(Boolean).join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>

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
