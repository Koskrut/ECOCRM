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

const CHART_MUTED = "#64748b";
const CREATED_FILL = "#6366f1";
const SOURCE_FILL = "#0ea5e9";
const STATUS_FILL = "#10b981";
const LOST_FILL = "#f97316";

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

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "Новий",
  IN_PROGRESS: "В роботі",
  WON: "Виграно",
  LOST: "Програно",
  NOT_TARGET: "Не цільовий",
  SPAM: "Спам",
};

const LEAD_STATUS_ORDER = ["NEW", "IN_PROGRESS", "WON", "LOST", "NOT_TARGET", "SPAM"];

function statusRank(s: string): number {
  const i = LEAD_STATUS_ORDER.indexOf(s);
  return i === -1 ? 500 : i;
}

export function LeadsCreatedTrendChart({ rows }: { rows: { date: string; count: number }[] }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `leadsCreated-${uid}`;
  const data = rows.map((r) => ({ ...r, label: formatAxisDate(r.date) }));
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Створені ліди"
      subtitle="Поточний період лише. Кількість за датою createdAt (UTC). Порівняння на графік не накладається."
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={260} minWidth={320}>
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CREATED_FILL} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CREATED_FILL} stopOpacity={0.02} />
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
            width={40}
            allowDecimals={false}
          />
          <Tooltip
            formatter={(value: number) => [value, "Лідів"]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as { date?: string } | undefined;
              return p?.date ?? "";
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
            dataKey="count"
            stroke={CREATED_FILL}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            name="Лідів"
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LeadsBySourceBarChart({ rows }: { rows: { source: string; count: number }[] }) {
  const data = useMemo(() => {
    const mapped = [...rows].sort((a, b) => b.count - a.count).slice(0, 12);
    return mapped.map((r) => ({ ...r, name: r.source.replace(/_/g, " ") }));
  }, [rows]);
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Ліди за джерелом"
      subtitle="Поле source (enum) у періоді. «OTHER» часто означає дефолт / невідомо — див. блок ризиків."
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)} minWidth={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: CHART_MUTED }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={100}
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            interval={0}
          />
          <Tooltip formatter={(value: number) => [value, "Лідів"]} contentStyle={tooltipBox} />
          <Bar dataKey="count" fill={SOURCE_FILL} radius={[0, 4, 4, 0]} name="Лідів" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LeadsByStatusBarChart({ rows }: { rows: { status: string; count: number }[] }) {
  const data = useMemo(() => {
    const mapped = rows.map((r) => ({
      ...r,
      name: LEAD_STATUS_LABELS[r.status] ?? r.status,
      rank: statusRank(r.status),
    }));
    mapped.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      return b.count - a.count;
    });
    return mapped;
  }, [rows]);
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Ліди за статусом"
      subtitle="Розподіл у періоді за полем status. LOST — лише enum LOST (не змішувати з NOT_TARGET / SPAM)."
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)} minWidth={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: CHART_MUTED }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 10, fill: CHART_MUTED }}
            interval={0}
          />
          <Tooltip formatter={(value: number) => [value, "Лідів"]} contentStyle={tooltipBox} />
          <Bar dataKey="count" fill={STATUS_FILL} radius={[0, 4, 4, 0]} name="Лідів" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function LostReasonsBarChart({ rows }: { rows: { reason: string; count: number }[] }) {
  const data = useMemo(() => [...rows].sort((a, b) => b.count - a.count).slice(0, 10), [rows]);
  const empty = data.length === 0;
  return (
    <ChartCard
      title="Причини програшу (LOST)"
      subtitle="Ліди зі статусом LOST у періоді, згруповані за statusReason. Порожнє або «не вказано» — типова дірка в даних."
      empty={empty}
    >
      <ResponsiveContainer width="100%" height={Math.max(260, data.length * 28)} minWidth={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: CHART_MUTED }} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="reason"
            width={140}
            tick={{ fontSize: 9, fill: CHART_MUTED }}
            interval={0}
          />
          <Tooltip formatter={(value: number) => [value, "Лідів"]} contentStyle={tooltipBox} />
          <Bar dataKey="count" fill={LOST_FILL} radius={[0, 4, 4, 0]} name="Лідів" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
