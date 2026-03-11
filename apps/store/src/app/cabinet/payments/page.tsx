"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getPayments } from "@/lib/api";
import { formatCabinetDate } from "@/lib/cabinet-utils";

const PAGE_SIZE = 10;

export default function CabinetPaymentsPage() {
  const searchParams = useSearchParams();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const [data, setData] = useState<Awaited<ReturnType<typeof getPayments>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getPayments(page, PAGE_SIZE)
      .then(setData)
      .catch(() => setErr("Не вдалося завантажити оплати"))
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
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Оплати
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Історія оплат. Всього: {data.total} {data.total === 1 ? "оплата" : "оплат"}.
      </p>

      {data.items.length ? (
        <>
          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[var(--border)]">
                <thead>
                  <tr>
                    <th className="bg-[var(--surface)] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Дата
                    </th>
                    <th className="bg-[var(--surface)] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Сума
                    </th>
                    <th className="bg-[var(--surface)] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Замовлення
                    </th>
                    <th className="bg-[var(--surface)] px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                      Статус
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-white">
                  {data.items.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                        {formatCabinetDate(p.paidAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-zinc-900">
                        {p.amount} {p.currency}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        {p.orderId ? (
                          <Link
                            href={`/cabinet/orders/${p.orderId}`}
                            className="text-[var(--primary)] hover:underline"
                          >
                            {p.orderNumber ?? p.orderId}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-zinc-600">
                        {p.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-center gap-2"
              aria-label="Пагінація оплат"
            >
              {hasPrev && (
                <Link
                  href={`/cabinet/payments?page=${page - 1}`}
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
                  href={`/cabinet/payments?page=${page + 1}`}
                  className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-[var(--surface)]"
                >
                  Далі →
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <p className="mt-6 text-zinc-500">Історія оплат порожня.</p>
      )}
    </div>
  );
}
