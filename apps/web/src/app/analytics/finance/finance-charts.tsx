"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BaseCurrency } from "@/lib/base-currency";
import { baseCurrencyLabel, baseCurrencySymbol } from "@/lib/base-currency";

const CHART_MUTED = "#64748b";
const DEBT_FILL = "#f97316";
const SOURCE_BANK = "#0ea5e9";

const tooltipBox = { borderRadius: "8px", border: "1px solid #e4e4e7", fontSize: "12px" };

function ChartCard({
  title,
  subtitle,
  children,
  empty,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      </div>
      <div className="mt-3 min-h-[240px] w-full min-w-0 flex-1 overflow-x-auto">
        {empty ? (
          <div className="flex h-[240px] min-w-[280px] items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50/80 text-sm text-zinc-500">
            Немає даних за обраний період
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

const BUCKET_ORDER = ["0-7", "8-14", "15-30", "31-60", "60+"];

export function DebtAgingBucketsChart({
  rows,
  currency = "USD",
}: {
  rows: { label: string; amount: number; ordersCount: number }[];
  currency?: BaseCurrency | string;
}) {
  const sym = baseCurrencySymbol(currency);
  const code = baseCurrencyLabel(currency);
  const data = useMemo(() => {
    const map = new Map(rows.map((r) => [r.label, r]));
    return BUCKET_ORDER.map((label) => map.get(label) ?? { label, amount: 0, ordersCount: 0 });
  }, [rows]);
  const empty = data.every((d) => d.amount === 0 && d.ordersCount === 0);
  return (
    <ChartCard
      title="Борг за віком прострочення"
      subtitle={`Операційний знімок: сума боргу замовлень з paymentDueDate у минулому, ${code}. Дні — від дати «оплата до» до сьогодні.`}
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={260} minWidth={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: CHART_MUTED }} />
          <YAxis
            type="category"
            dataKey="label"
            width={52}
            tick={{ fontSize: 10, fill: CHART_MUTED }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "amount" ? `${Math.round(value).toLocaleString("en-US")} ${sym}` : value,
              name === "amount" ? `Сума (${code})` : "Замовлень",
            ]}
            contentStyle={tooltipBox}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
          <Bar dataKey="amount" fill={DEBT_FILL} name="amount" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const SOURCE_LABEL: Record<string, string> = {
  BANK: "Банк",
  CASH: "Готівка",
};

export function PaymentsBySourceTypeChart({
  rows,
  currency = "USD",
}: {
  rows: { sourceType: string; count: number; amount: number }[];
  currency?: BaseCurrency | string;
}) {
  const sym = baseCurrencySymbol(currency);
  const code = baseCurrencyLabel(currency);
  const data = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        name: SOURCE_LABEL[r.sourceType] ?? r.sourceType,
      })),
    [rows],
  );
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Оплати за каналом (завершені)"
      subtitle={`Поточний період лише. sourceType: BANK / CASH. Сума в ${code}.`}
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={260} minWidth={320}>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: CHART_MUTED }} />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            width={48}
            tickFormatter={(v) => `${v}`}
            label={{
              value: code,
              angle: -90,
              position: "insideLeft",
              fill: CHART_MUTED,
              fontSize: 10,
            }}
          />
          <Tooltip
            formatter={(value: number, name: string) => [
              name === "amount" ? `${Math.round(value).toLocaleString("en-US")} ${sym}` : value,
              name === "amount" ? "Сума" : "Кількість",
            ]}
            contentStyle={tooltipBox}
          />
          <Legend />
          <Bar dataKey="amount" fill={SOURCE_BANK} name="amount" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
