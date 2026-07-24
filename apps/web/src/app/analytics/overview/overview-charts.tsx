"use client";

import { useId, useMemo } from "react";
import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
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
const BOOKED_FILL = "#10b981";
const COLLECTED_FILL = "#0ea5e9";
const STAGE_FILL = "#6366f1";

/** Same logical funnel order as dashboard (analytics overview stage bar). */
const STAGE_ORDER: string[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "RETURN_IN_PROGRESS",
  "FULLY_RETURNED",
  "CANCELED",
  "REFUSED",
  "UNKNOWN",
];

function formatAxisDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}`;
}

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

const tooltipBox = { borderRadius: "8px", border: "1px solid #e4e4e7", fontSize: "12px" };

export function BookedRevenueTrendChart({
  rows,
  currency = "USD",
}: {
  rows: { date: string; amount: number; ordersCount: number }[];
  currency?: BaseCurrency | string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `bookedFill-${uid}`;
  const sym = baseCurrencySymbol(currency);
  const code = baseCurrencyLabel(currency);
  const data = rows.map((r) => ({
    ...r,
    label: formatAxisDate(r.date),
  }));
  const empty = data.length === 0;
  return (
    <ChartCard
      title={`Заброньований дохід (${code})`}
      subtitle={`Поточний період overview лише. Сума по днях: max(0, total − returns) → ${code}. Вісь X — день створення замовлення (UTC).`}
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={260} minWidth={320}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BOOKED_FILL} stopOpacity={0.35} />
              <stop offset="100%" stopColor={BOOKED_FILL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            tickLine={false}
            axisLine={{ stroke: "#e4e4e7" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            tickLine={false}
            axisLine={false}
            width={44}
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
            formatter={(value: number) => [
              `${Math.round(value).toLocaleString("en-US")} ${sym}`,
              "Заброньовано",
            ]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as
                | { date?: string; ordersCount?: number }
                | undefined;
              if (!p?.date) return "";
              return `${p.date} · ${p.ordersCount ?? 0} замовл.`;
            }}
            contentStyle={tooltipBox}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: "11px", paddingBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={BOOKED_FILL}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            name={`Заброньовано (${code})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function CollectedPaymentsTrendChart({
  rows,
  currency = "USD",
  subtitle,
}: {
  rows: { date: string; amount: number; paymentCount: number }[];
  currency?: BaseCurrency | string;
  /** Override for Finance / other pages reusing this chart. */
  subtitle?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const gradId = `collectedFill-${uid}`;
  const sym = baseCurrencySymbol(currency);
  const code = baseCurrencyLabel(currency);
  const data = rows.map((r) => ({ ...r, label: formatAxisDate(r.date) }));
  const empty = data.length === 0;
  const resolvedSubtitle =
    subtitle ??
    `Поточний період overview лише. Оплати COMPLETED; дата — paidAt (UTC). Сума в ${code}.`;
  return (
    <ChartCard title={`Зібрані оплати (${code})`} subtitle={resolvedSubtitle} empty={empty}>
      <ResponsiveContainer width="100%" height={260} minWidth={320}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLLECTED_FILL} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COLLECTED_FILL} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            tickLine={false}
            axisLine={{ stroke: "#e4e4e7" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            tickLine={false}
            axisLine={false}
            width={44}
            label={{
              value: code,
              angle: -90,
              position: "insideLeft",
              fill: CHART_MUTED,
              fontSize: 10,
            }}
          />
          <Tooltip
            formatter={(value: number) => [
              `${Math.round(value).toLocaleString("en-US")} ${sym}`,
              "Зібрано",
            ]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as
                | { date?: string; paymentCount?: number }
                | undefined;
              if (!p?.date) return "";
              return `${p.date} · ${p.paymentCount ?? 0} платежів`;
            }}
            contentStyle={tooltipBox}
          />
          <Legend
            verticalAlign="top"
            align="right"
            wrapperStyle={{ fontSize: "11px", paddingBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke={COLLECTED_FILL}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            name={`Зібрано (${code})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const STAGE_LABELS: Record<string, string> = {
  UNKNOWN: "Невідомо",
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
};

function stageRank(stage: string): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i === -1 ? 1000 + stage.charCodeAt(0) : i;
}

export function OrdersByStageBarChart({ rows }: { rows: { stage: string; count: number }[] }) {
  const data = useMemo(() => {
    const mapped = rows.map((r) => ({
      ...r,
      name: STAGE_LABELS[r.stage] ?? r.stage,
      rank: stageRank(r.stage),
    }));
    mapped.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.count - a.count;
    });
    return mapped.slice(0, 14);
  }, [rows]);
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Замовлення за стадіями"
      subtitle="Кількість замовлень у поточному періоді overview (createdAt) за orderStage. Порядок стадій — логіка воронки, не за обсягом."
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)} minWidth={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            label={{
              value: "Кількість",
              position: "bottom",
              offset: 0,
              fill: CHART_MUTED,
              fontSize: 10,
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={118}
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            interval={0}
          />
          <Tooltip
            formatter={(value: number) => [value, "Замовлень"]}
            labelFormatter={(label) => String(label)}
            contentStyle={tooltipBox}
          />
          <Bar dataKey="count" fill={STAGE_FILL} radius={[0, 4, 4, 0]} name="Замовлень" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
