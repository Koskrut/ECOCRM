"use client";

import Link from "next/link";
import { formatMoneyBase } from "@/app/analytics/analytics-ui";
import type { DashboardV2Response } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";

type Props = {
  attention: DashboardV2Response["attention"];
  currency: BaseCurrency;
  showAnalyticsLink?: boolean;
};

export function DashboardAttentionPanel({ attention, currency, showAnalyticsLink }: Props) {
  const attentionHref = "/analytics/attention";

  return (
    <section className="min-w-0 rounded-xl border border-amber-200/60 bg-amber-50/20 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Потребує уваги</h2>
          <p className="mt-1 text-sm text-amber-900/80">
            Ризики та прострочення, що потребують дій сьогодні.
          </p>
        </div>
        {showAnalyticsLink ? (
          <Link
            href={attentionHref}
            className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Відкрити розділ «Увага»
          </Link>
        ) : null}
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AttentionTile
          title="Прострочені завдання"
          count={attention.crm.overdueTasksCount}
          href="/tasks?attention=overdue"
          hint="Завдання з минулим дедлайном"
        />
        <AttentionTile
          title="Завислі угоди"
          count={attention.crm.stuckOrdersCount}
          href="/orders?attention=stuck"
          hint="Без руху стадії > 3 дні"
        />
        <AttentionTile
          title="Ліди без дотику"
          count={attention.crm.leadsWithoutTouchCount}
          href="/leads?attention=without-touch"
          hint="Нові / в роботі без активності"
        />
        <AttentionTile
          title="Прострочені оплати"
          count={attention.finance.overdueOrdersCount}
          href="/orders?attention=overdue-payments"
          hint="Прострочені з боргом"
        />
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Сума простроченого боргу: {formatMoneyBase(attention.finance.overdueDebtAmount, currency)}
      </p>
    </section>
  );
}

function AttentionTile({
  title,
  count,
  href,
  hint,
}: {
  title: string;
  count: number;
  href: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-amber-200/80 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{count}</div>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      <div className="mt-2 text-xs font-medium text-zinc-700">Перейти →</div>
    </Link>
  );
}
