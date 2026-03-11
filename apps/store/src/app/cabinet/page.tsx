"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getMe, getOrders, getTelegramLink } from "@/lib/api";
import { Button } from "@/components/Button";
import { formatCabinetDateShort } from "@/lib/cabinet-utils";
import { orderStatusLabel } from "@/lib/cabinet-utils";

export default function CabinetOverviewPage() {
  const [me, setMe] = useState<Awaited<ReturnType<typeof getMe>> | null>(null);
  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getOrders>> | null>(null);
  const [telegramLink, setTelegramLink] = useState<{ link: string; code: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getMe(), getOrders(1)])
      .then(([meData, ordersData]) => {
        setMe(meData);
        setOrders(ordersData);
      })
      .catch(() => setErr("Потрібно увійти в кабінет"))
      .finally(() => setLoading(false));
  }, []);

  const handleGetTelegramLink = async () => {
    try {
      const data = await getTelegramLink();
      setTelegramLink({ link: data.link, code: data.code });
    } catch {
      setErr("Не вдалося отримати посилання");
    }
  };

  if (loading) {
    return (
      <div>
        <div className="h-8 w-56 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 h-32 animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }
  if (err || !me) {
    return (
      <div>
        <div className="rounded-xl border border-[var(--border)] bg-white p-6 text-center">
          <p className="text-red-600">{err ?? "Помилка"}</p>
          <Link href="/login" className="mt-4 inline-block text-[var(--primary)] hover:underline">
            Увійти
          </Link>
        </div>
      </div>
    );
  }

  const totalOrders = orders?.total ?? 0;
  const lastOrders = (orders?.items ?? []).slice(0, 5);
  const spentFromFirstPage = (orders?.items ?? []).reduce((sum, o) => sum + o.paidAmount, 0);

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Огляд
      </h1>
      <p className="mt-1 text-zinc-600">
        Вітаємо, {me.firstName} {me.lastName}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-zinc-500">Замовлень</h2>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{totalOrders}</p>
          <Link
            href="/cabinet/orders"
            className="mt-2 inline-block text-sm text-[var(--primary)] hover:underline"
          >
            Всі замовлення →
          </Link>
        </section>
        {totalOrders > 0 && (
          <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-zinc-500">Оплачено (останні)</h2>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">
              {spentFromFirstPage} грн
            </p>
            <p className="mt-1 text-xs text-zinc-500">за першою сторінкою замовлень</p>
          </section>
        )}
      </div>

      {!me.telegramLinked && (
        <section className="mt-8 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="font-medium text-zinc-900">Прив&apos;язати Telegram</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Зручно отримувати сповіщення та листуватися в одному чаті з компанією.
          </p>
          {!telegramLink ? (
            <Button type="button" onClick={handleGetTelegramLink} className="mt-3">
              Підключити
            </Button>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <a
                href={telegramLink.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--primary)] hover:underline"
              >
                Перейти в бота за посиланням
              </a>
              <p className="text-zinc-500">
                Або надішліть боту код: <strong>{telegramLink.code}</strong>
              </p>
            </div>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-medium text-zinc-900">Останні замовлення</h2>
        {lastOrders.length ? (
          <ul className="space-y-3">
            {lastOrders.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm"
              >
                <Link
                  href={`/cabinet/orders/${o.id}`}
                  prefetch={false}
                  className="font-medium text-zinc-900 hover:text-[var(--primary)]"
                >
                  {o.orderNumber}
                </Link>
                <span className="ml-2 text-sm text-zinc-500">
                  {orderStatusLabel(o.status)}
                </span>
                <span className="ml-2 text-sm text-zinc-500">
                  {formatCabinetDateShort(o.createdAt)}
                </span>
                <span className="ml-2 font-medium">{o.totalAmount} грн</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-zinc-500">Замовлень поки немає.</p>
        )}
        {totalOrders > 0 && (
          <Link
            href="/cabinet/orders"
            className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
          >
            Всі замовлення →
          </Link>
        )}
      </section>
    </div>
  );
}
