"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AnalyticsErrorPanel,
  AnalyticsFiltersBar,
  AnalyticsOverviewSkeleton,
  KpiDeltaCard,
  SimpleTable,
  formatMoneyBase,
  formatMoneyBaseFine,
  formatNumber,
  useAnalyticsFetch,
  useAnalyticsFilters,
} from "../analytics-ui";
import { deltaCountLine, deltaMoneyLine, deltaMoneyLineFine } from "../analytics-delta";
import { CollectedPaymentsTrendChart } from "../overview/overview-charts";
import { DebtAgingBucketsChart, PaymentsBySourceTypeChart } from "./finance-charts";

type FinanceKpi = {
  collectedPayments: number;
  paymentsCount: number;
  avgPayment: number;
  debtTotal: number;
  overdueDebt: number;
  overdueOrdersCount: number;
  customersWithOverdueCount: number;
  pendingPaymentsCount: number;
};

type FinancePayload = {
  kpi: FinanceKpi;
  charts: {
    collectedPaymentsByDay: { date: string; amount: number; paymentCount: number }[];
    debtAgingBuckets: { label: string; amount: number; ordersCount: number }[];
    paymentsBySourceType: { sourceType: string; count: number; amount: number }[];
  };
  tables: {
    topDebtors: Array<{
      clientId: string;
      clientName: string | null;
      debtAmount: number;
      overdueAmount: number;
      orderCount: number;
    }>;
    overdueOrders: Array<{
      id: string;
      orderNumber: string;
      clientName: string | null;
      debtAmount: number;
      paymentDueDate: string | null;
    }>;
  };
};

type FinanceApiResponse = {
  currency?: string;
  data: FinancePayload;
  compare?: { kpi: Pick<FinanceKpi, "collectedPayments" | "paymentsCount" | "avgPayment"> };
};

type DebtorSortKey = "clientName" | "debtAmount" | "overdueAmount" | "orderCount";
type SortDir = "asc" | "desc";

export default function AnalyticsFinancePage() {
  const router = useRouter();
  const filters = useAnalyticsFilters();
  const [refreshKey, setRefreshKey] = useState(0);
  const [debtorSort, setDebtorSort] = useState<{ key: DebtorSortKey; dir: SortDir }>({
    key: "debtAmount",
    dir: "desc",
  });

  const { data, loading, error } = useAnalyticsFetch<FinanceApiResponse>(
    "finance",
    filters.querySuffix,
    refreshKey,
  );

  const kpi = data?.data.kpi;
  const currency = data?.currency === "EUR" ? "EUR" : "USD";
  const charts = data?.data.charts;
  const tables = data?.data.tables;
  const cmp = data?.compare?.kpi;

  const attentionHref = useMemo(
    () => `/analytics/attention${filters.querySuffix}`,
    [filters.querySuffix],
  );

  const sortedDebtors = useMemo(() => {
    const rows = [...(tables?.topDebtors ?? [])];
    const mul = debtorSort.dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const k = debtorSort.key;
      if (k === "clientName")
        return mul * (a.clientName ?? a.clientId).localeCompare(b.clientName ?? b.clientId, "uk");
      return mul * (Number(a[k]) - Number(b[k]));
    });
    return rows;
  }, [tables?.topDebtors, debtorSort]);

  const toggleDebtorSort = (key: DebtorSortKey) => {
    setDebtorSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "clientName" ? "asc" : "desc" },
    );
  };

  const sortMark = (key: DebtorSortKey) =>
    debtorSort.key === key ? (debtorSort.dir === "asc" ? " ↑" : " ↓") : "";

  const filtersBar = (
    <AnalyticsFiltersBar
      dateFrom={filters.dateFrom}
      dateTo={filters.dateTo}
      managerId={filters.managerId}
      managers={filters.managers}
      rangePreset={filters.rangePreset}
      comparePrev={filters.comparePrev}
      onDateFromChange={filters.setDateFrom}
      onDateToChange={filters.setDateTo}
      onManagerIdChange={filters.setManagerId}
      onRangePresetChange={filters.setRangePreset}
      onComparePrevChange={filters.setComparePrev}
    />
  );

  if (loading) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsOverviewSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {filtersBar}
        <AnalyticsErrorPanel message={error} onRetry={() => setRefreshKey((k) => k + 1)} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      {filtersBar}

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Фінанси — KPI</h2>
        <p className="mt-1 text-sm text-zinc-500">
          <strong>Collected</strong> — період (COMPLETED, paidAt).{" "}
          <strong>Борг / прострочення</strong> — замовлення з{" "}
          <code className="rounded bg-zinc-100 px-1">createdAt</code> у вибраному періоді; дельта
          «vs попередній» лише для збору платежів. Booked revenue тут не показуємо.
        </p>
        <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiDeltaCard
            variant="money"
            title="Collected payments"
            subtitle={`COMPLETED → ${currency}, paidAt у періоді`}
            tooltip="Та сама семантика, що Overview / Sales collected."
            value={formatMoneyBase(kpi?.collectedPayments, currency)}
            deltaLabel={
              filters.comparePrev
                ? deltaMoneyLine(kpi?.collectedPayments ?? 0, cmp?.collectedPayments)
                : null
            }
          />
          <KpiDeltaCard
            variant="count"
            title="Payments count"
            subtitle="Кількість COMPLETED у періоді"
            value={formatNumber(kpi?.paymentsCount)}
            deltaLabel={
              filters.comparePrev
                ? deltaCountLine(kpi?.paymentsCount ?? 0, cmp?.paymentsCount)
                : null
            }
          />
          <KpiDeltaCard
            variant="money"
            title="Avg payment size"
            subtitle={`Collected / count (${currency})`}
            value={formatMoneyBaseFine(kpi?.avgPayment, currency)}
            deltaLabel={
              filters.comparePrev
                ? deltaMoneyLineFine(kpi?.avgPayment ?? 0, cmp?.avgPayment)
                : null
            }
          />
          <KpiDeltaCard
            variant="risk"
            title="Debt total"
            subtitle="Сума debtAmount, замовлення за період (createdAt)"
            tooltip="У межах обраного діапазону дат і scope."
            value={formatMoneyBase(kpi?.debtTotal, currency)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Overdue debt"
            subtitle="OVERDUE + debt за той самий когортний період"
            value={formatMoneyBase(kpi?.overdueDebt, currency)}
            deltaLabel={null}
            onDrill={() => router.push(`${attentionHref}#finance-overdue`, { scroll: false })}
            drillLabel="Attention: прострочені оплати →"
          />
          <KpiDeltaCard
            variant="risk"
            title="Overdue orders"
            subtitle="Замовлень з боргом і OVERDUE"
            value={formatNumber(kpi?.overdueOrdersCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Customers w/ overdue"
            subtitle="Унікальні клієнти в когорті прострочених за період"
            value={formatNumber(kpi?.customersWithOverdueCount)}
            deltaLabel={null}
          />
          <KpiDeltaCard
            variant="risk"
            title="Pending payments"
            subtitle="PENDING на замовленнях, створених у періоді"
            tooltip="Не сплутувати з COMPLETED collected; очікує підтвердження."
            value={formatNumber(kpi?.pendingPaymentsCount)}
            deltaLabel={null}
          />
        </div>
      </section>

      <section className="min-w-0">
        <h2 className="text-lg font-semibold text-zinc-900">Графіки</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Збір платежів і борг за віком — для обраного періоду (вік рахується відносно кінця
          періоду).
        </p>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <CollectedPaymentsTrendChart
            rows={charts?.collectedPaymentsByDay ?? []}
            currency={currency}
            subtitle="Поточний період finance. COMPLETED; paidAt (UTC). Окремо від booked revenue."
          />
          <DebtAgingBucketsChart rows={charts?.debtAgingBuckets ?? []} currency={currency} />
          <div className="lg:col-span-2">
            <PaymentsBySourceTypeChart rows={charts?.paymentsBySourceType ?? []} currency={currency} />
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-xl border border-amber-200/60 bg-amber-50/20 p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Операційні сигнали</h2>
        <p className="mt-1 text-sm text-amber-900/85">
          Борг, прострочення та PENDING на цій сторінці — у межах обраного періоду (див. KPI).
          Детальні черги:{" "}
          <Link
            href={`${attentionHref}#finance-overdue`}
            scroll={false}
            className="font-medium text-indigo-700 underline-offset-2 hover:underline"
          >
            прострочені оплати
          </Link>
          ,{" "}
          <Link
            href={`${attentionHref}#overdue-tasks`}
            scroll={false}
            className="font-medium text-indigo-700 underline-offset-2 hover:underline"
          >
            задачі
          </Link>
          .
        </p>
      </section>

      <section className="min-w-0 space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">Топ боржників (за сумою боргу)</h2>
        <p className="text-sm text-zinc-500">
          Агрегація по клієнту з замовлень з debt і paymentDueDate; snapshot.
        </p>
        <div className="min-w-0 overflow-x-auto">
          <table className="min-w-[640px] w-full border-collapse rounded-xl border border-zinc-200 bg-white text-sm shadow-sm">
            <thead className="bg-zinc-50 text-left text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">
                  <button
                    type="button"
                    className="hover:text-zinc-800"
                    onClick={() => toggleDebtorSort("clientName")}
                  >
                    Клієнт{sortMark("clientName")}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <button
                    type="button"
                    className="hover:text-zinc-800"
                    onClick={() => toggleDebtorSort("debtAmount")}
                  >
                    Борг ({currency}){sortMark("debtAmount")}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <button
                    type="button"
                    className="hover:text-zinc-800"
                    onClick={() => toggleDebtorSort("overdueAmount")}
                  >
                    Прострочено{sortMark("overdueAmount")}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium text-right">
                  <button
                    type="button"
                    className="hover:text-zinc-800"
                    onClick={() => toggleDebtorSort("orderCount")}
                  >
                    Замовлень{sortMark("orderCount")}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedDebtors.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-zinc-500" colSpan={4}>
                    Немає даних
                  </td>
                </tr>
              ) : (
                sortedDebtors.map((row) => (
                  <tr key={row.clientId} className="border-t border-zinc-100">
                    <td className="px-4 py-3 text-zinc-900">{row.clientName ?? row.clientId}</td>
                    <td className="px-4 py-3 text-right text-zinc-800">
                      {formatMoneyBase(row.debtAmount, currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-800">
                      {formatMoneyBase(row.overdueAmount, currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-800">
                      {formatNumber(row.orderCount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="min-w-0 space-y-2">
        <h2 className="text-lg font-semibold text-zinc-900">Прострочені замовлення (приклад)</h2>
        <p className="text-sm text-zinc-500">
          До 50 рядків, найближчі paymentDueDate спочатку. {currency}.
        </p>
        <div className="min-w-0 overflow-x-auto">
          <SimpleTable
            rows={tables?.overdueOrders ?? []}
            columns={[
              { key: "orderNumber", title: "Замовлення", render: (row) => row.orderNumber },
              { key: "clientName", title: "Клієнт", render: (row) => row.clientName ?? "—" },
              {
                key: "debtAmount",
                title: `Борг (${currency})`,
                render: (row) => formatMoneyBase(row.debtAmount, currency),
              },
              {
                key: "paymentDueDate",
                title: "Оплата до",
                render: (row) => row.paymentDueDate ?? "—",
              },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
