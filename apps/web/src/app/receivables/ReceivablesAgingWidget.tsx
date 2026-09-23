"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
import { strings } from "@/locales";
import type { AgingChip } from "./aging";

const CHART_MUTED = "#64748b";
const DEBT_FILL = "#f97316";

export type AgingBucketRow = {
  label: string;
  amount: number;
  clientsCount: number;
};

const BUCKET_ORDER = ["0-7", "8-30", "31-60", "90+"] as const;

export function ReceivablesAgingWidget({
  buckets,
  currency,
  activeAging,
  onSelectAging,
}: {
  buckets: AgingBucketRow[];
  currency: string;
  activeAging: AgingChip;
  onSelectAging: (chip: AgingChip) => void;
}) {
  const t = strings.receivables;
  const [open, setOpen] = useState(true);
  const sym = currency === "EUR" ? "€" : "$";

  const data = useMemo(() => {
    const map = new Map(buckets.map((b) => [b.label, b]));
    return BUCKET_ORDER.map(
      (label) => map.get(label) ?? { label, amount: 0, clientsCount: 0 },
    );
  }, [buckets]);

  const empty = data.every((d) => d.amount === 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">{t.agingWidgetTitle}</h3>
          <p className="text-xs text-zinc-500">{t.agingWidgetSubtitle}</p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500" />
        )}
      </button>
      {open ? (
        <div className="border-t border-zinc-100 px-4 pb-4 pt-2">
          {empty ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t.agingWidgetEmpty}</p>
          ) : (
            <div className="h-[200px] w-full min-w-0">
              <ResponsiveContainer width="100%" height={200} minWidth={280}>
                <BarChart
                  data={data}
                  layout="vertical"
                  margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: CHART_MUTED }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={48}
                    tick={{ fontSize: 11, fill: CHART_MUTED }}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${Number(value).toFixed(2)} ${sym}`, t.colDebt]}
                    labelFormatter={(label) => {
                      const row = data.find((d) => d.label === label);
                      return `${label} · ${row?.clientsCount ?? 0} ${t.kpiClients.toLowerCase()}`;
                    }}
                  />
                  <Bar
                    dataKey="amount"
                    fill={DEBT_FILL}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(entry) => {
                      const label = String(
                        (entry as { label?: string })?.label ?? "",
                      ) as AgingChip;
                      if (BUCKET_ORDER.includes(label as (typeof BUCKET_ORDER)[number])) {
                        onSelectAging(activeAging === label ? "" : label);
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
