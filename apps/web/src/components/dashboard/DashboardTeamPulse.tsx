"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Phone, CalendarDays } from "lucide-react";
import { formatNumber } from "@/app/analytics/analytics-ui";
import { DayPlanPercentBadge } from "@/components/day-plan/DayPlanWidget";
import type { DashboardV2TeamPulseRow } from "@/lib/api/resources/dashboard";
import { baseCurrencySymbol } from "@/lib/base-currency";
import { shiftYmdInKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";

type Props = {
  date: string;
  currency: string;
  rows: DashboardV2TeamPulseRow[];
  showTeamDayPlan: boolean;
  onDateChange: (date: string) => void;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function DashboardTeamPulse({
  date,
  currency,
  rows,
  showTeamDayPlan,
  onDateChange,
}: Props) {
  const sorted = [...rows].sort((a, b) => a.dayPlanPercent - b.dayPlanPercent);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <CalendarDays className="h-4 w-4" />
          Активність команди за день
        </h2>
        <DatePicker value={date} onChange={onDateChange} />
      </div>
      <p className="mb-3 text-xs text-zinc-500">
        День за календарною датою (Київ). Візити — лише завершені.
        {showTeamDayPlan ? " Сортування за % плану дня (найнижчі зверху)." : ""}
      </p>
      {sorted.length === 0 ? (
        <p className="text-sm text-zinc-500">Немає даних за обраний день.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-3">Менеджер</th>
                {showTeamDayPlan ? <th className="py-2 pr-2">% плану</th> : null}
                <th className="py-2 pr-2">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Вхідні
                  </span>
                </th>
                <th className="py-2 pr-2">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Вихідні
                  </span>
                </th>
                <th className="py-2 pr-2">Візити</th>
                <th className="py-2 pr-2">Замовлення</th>
                <th className="py-2 pr-2">Сума замовлень</th>
                <th className="py-2 pr-2">Оплати ({currency})</th>
                <th className="py-2 pr-2">Простроч. задачі</th>
                <th className="py-2">Візити без нотатки</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.userId} className="border-b border-zinc-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-zinc-900">
                    {showTeamDayPlan ? (
                      <Link
                        href={`/work/day-plan?date=${encodeURIComponent(date)}&userId=${encodeURIComponent(row.userId)}`}
                        className="hover:text-sky-700 hover:underline"
                      >
                        {row.fullName}
                      </Link>
                    ) : (
                      row.fullName
                    )}
                  </td>
                  {showTeamDayPlan ? (
                    <td className="py-2 pr-2">
                      <DayPlanPercentBadge
                        percent={row.dayPlanPercent}
                        status={row.dayPlanStatus}
                      />
                    </td>
                  ) : null}
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.callsInbound}</td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.callsOutbound}</td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.visits}</td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.ordersCount}</td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">
                    {formatMoney(row.ordersAmount)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">
                    {formatMoney(row.paymentsAmount)} {baseCurrencySymbol(currency)}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-zinc-800">
                    {row.overdueTasks > 0 ? (
                      <span className="font-medium text-amber-800">{row.overdueTasks}</span>
                    ) : (
                      formatNumber(row.overdueTasks)
                    )}
                  </td>
                  <td className="py-2 tabular-nums text-zinc-800">
                    {row.visitsWithoutNote > 0 ? (
                      <span className="font-medium text-red-700">{row.visitsWithoutNote}</span>
                    ) : (
                      formatNumber(row.visitsWithoutNote)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DatePicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftYmdInKyiv(value, -1))}
        className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
        aria-label="Попередній день"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      />
      <button
        type="button"
        onClick={() => onChange(shiftYmdInKyiv(value, 1))}
        className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
        aria-label="Наступний день"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange(todayYmdInKyiv())}
        className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Сьогодні
      </button>
    </div>
  );
}
