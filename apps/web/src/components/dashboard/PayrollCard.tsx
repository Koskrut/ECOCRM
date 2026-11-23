"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import {
  payrollApi,
  type PayrollBreakdown,
  type PayrollTeamResponse,
} from "@/lib/api/resources/payroll";
import { strings } from "@/locales";

function currentMonthYm(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
  });
  // en-CA gives YYYY-MM-DD; take YYYY-MM
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatUah(n: number): string {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatNum(n: number, digits = 2): string {
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(n);
}

type Props = {
  /** When set, load this user's breakdown (admin/lead drill-down). */
  userId?: string;
  showTeam?: boolean;
  className?: string;
};

export function PayrollCard({ userId, showTeam = false, className }: Props) {
  const t = strings.dashboard.payroll;
  const [month, setMonth] = useState(currentMonthYm);
  const [data, setData] = useState<PayrollBreakdown | null>(null);
  const [team, setTeam] = useState<PayrollTeamResponse | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<PayrollBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const breakdown = userId
        ? await payrollApi.user(userId, month)
        : await payrollApi.me(month);
      setData(breakdown);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month, t.loadError, userId]);

  const loadTeam = useCallback(async () => {
    if (!showTeam) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      setTeam(await payrollApi.team(month));
    } catch (e) {
      setTeam(null);
      setTeamError(getUserFriendlyApiError(e, t.loadError));
    } finally {
      setTeamLoading(false);
    }
  }, [month, showTeam, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadTeam();
  }, [loadTeam]);

  useEffect(() => {
    if (!expandedId) {
      setExpanded(null);
      return;
    }
    let cancelled = false;
    void payrollApi.user(expandedId, month).then(
      (b) => {
        if (!cancelled) setExpanded(b);
      },
      () => {
        if (!cancelled) setExpanded(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [expandedId, month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return new Intl.DateTimeFormat("uk-UA", { month: "long", year: "numeric" }).format(
      new Date(Date.UTC(y, m - 1, 1)),
    );
  }, [month]);

  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-0.5 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            aria-label={t.prevMonth}
          >
            ←
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium capitalize text-zinc-800">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
            aria-label={t.nextMonth}
          >
            →
          </button>
        </div>
      </div>

      {showTeam ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-zinc-900">{t.teamTitle}</h3>
          {teamError ? (
            <ErrorPanel variant="inline" message={teamError} onRetry={() => void loadTeam()} />
          ) : null}
          {teamLoading && !team ? <PageLoading inline /> : null}
          {team && team.rows.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">{t.teamEmpty}</p>
          ) : null}
          {team && team.rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-2 pr-3 font-medium">{t.colName}</th>
                    <th className="py-2 pr-3 font-medium">{t.colSales}</th>
                    <th className="py-2 pr-3 font-medium">{t.colBonus}</th>
                    <th className="py-2 pr-3 font-medium">{t.colTeamBonus}</th>
                    <th className="py-2 pr-3 font-medium">{t.colAmort}</th>
                    <th className="py-2 pr-3 font-medium">{t.colFuel}</th>
                    <th className="py-2 pr-3 font-medium">{t.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {team.rows.map((row) => (
                    <Fragment key={row.userId}>
                      <tr
                        className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50"
                        onClick={() =>
                          setExpandedId((id) => (id === row.userId ? null : row.userId))
                        }
                      >
                        <td className="py-2 pr-3 font-medium text-zinc-900">{row.fullName}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatUah(row.salesBaseUah)}</td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {formatUah(row.bonusUah)}
                          <span className="ml-1 text-xs text-zinc-400">
                            ({formatNum(row.appliedPercent, 2)}%)
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {formatUah(row.leadTeamBonusUah ?? 0)}
                        </td>
                        <td className="py-2 pr-3 text-zinc-700">{formatUah(row.amortizationUah)}</td>
                        <td className="py-2 pr-3 text-zinc-700">
                          {formatUah(row.fuelCompensationUah ?? 0)}
                        </td>
                        <td className="py-2 pr-3 font-semibold text-zinc-900">
                          {formatUah(row.totalUah)}
                        </td>
                      </tr>
                      {expandedId === row.userId && expanded?.userId === row.userId ? (
                        <tr>
                          <td colSpan={7} className="bg-zinc-50/80 px-2 py-3">
                            <PayrollBreakdownView data={expanded} compact />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <ErrorPanel variant="inline" message={error} onRetry={() => void load()} /> : null}
      {loading && !data ? <PageLoading inline /> : null}

      {data ? (
        <div className={showTeam ? "mt-6 border-t border-zinc-100 pt-5" : "mt-4"}>
          {showTeam ? (
            <h3 className="mb-2 text-sm font-semibold text-zinc-900">{t.myPayrollTitle}</h3>
          ) : null}
          <PayrollBreakdownView data={data} />
        </div>
      ) : null}
    </section>
  );
}

function PayrollBreakdownView({
  data,
  compact = false,
}: {
  data: PayrollBreakdown;
  compact?: boolean;
}) {
  const t = strings.dashboard.payroll;
  const ratesLabel =
    data.bonusRates.source === "personal" ? t.ratesPersonal : t.ratesCompany;

  return (
    <div className={compact ? "space-y-3" : "mt-4 space-y-4"}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label={t.baseSalary} value={formatUah(data.baseSalaryUah)} />
        <Stat
          label={t.salesBonus}
          value={formatUah(data.bonusUah)}
          hint={`${formatNum(data.appliedPercent, 2)}% · ${ratesLabel}`}
        />
        {(data.leadTeamBonusUah ?? 0) > 0 || (data.teamSalesBaseUah ?? 0) > 0 ? (
          <Stat
            label={t.leadTeamBonus}
            value={formatUah(data.leadTeamBonusUah ?? 0)}
            hint={t.leadTeamBonusHint({
              percent: formatNum(data.leadTeamBonusPercent ?? 0, 2),
              sales: formatUah(data.teamSalesBaseUah ?? 0),
            })}
          />
        ) : null}
        <Stat
          label={t.amortization}
          value={formatUah(data.amortizationUah)}
          hint={`${formatNum(data.totalKm, 1)} км × ${formatNum(data.amortizationUahPerKm, 2)}`}
        />
        <Stat
          label={t.fuelCompensation}
          value={formatUah(data.fuelCompensationUah ?? 0)}
          hint={t.fuelCompensationHint}
        />
        <Stat label={t.total} value={formatUah(data.totalUah)} emphasize />
      </div>

      <p className="text-xs text-zinc-500">{t.fuelNote}</p>

      {!compact || data.orders.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-zinc-800">{t.ordersTitle}</h4>
          {data.orders.length === 0 ? (
            <p className="mt-1 text-sm text-zinc-500">{t.ordersEmpty}</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                    <th className="py-1.5 pr-3 font-medium">{t.colOrder}</th>
                    <th className="py-1.5 pr-3 font-medium">{t.colClosed}</th>
                    <th className="py-1.5 pr-3 font-medium">{t.colAmount}</th>
                    <th className="py-1.5 pr-3 font-medium">{t.colUah}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.orders.map((o) => (
                    <tr key={o.orderId} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-3 text-zinc-900">{o.orderNumber}</td>
                      <td className="py-1.5 pr-3 text-zinc-600">{o.closedAt}</td>
                      <td className="py-1.5 pr-3 text-zinc-700">
                        {formatNum(o.amountOriginal)} {o.currency}
                        {o.rateFallback ? (
                          <span className="ml-1 text-xs text-amber-600">{t.rateFallback}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3 text-zinc-900">{formatUah(o.amountUah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {data.fuelDays.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-zinc-800">{t.daysTitle}</h4>
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-1.5 pr-3 font-medium">{t.colDate}</th>
                  <th className="py-1.5 pr-3 font-medium">{t.colKm}</th>
                  <th className="py-1.5 pr-3 font-medium">{t.colAmort}</th>
                  <th className="py-1.5 pr-3 font-medium">{t.colFuel}</th>
                </tr>
              </thead>
              <tbody>
                {data.fuelDays.map((d) => (
                  <tr key={d.date} className="border-b border-zinc-100">
                    <td className="py-1.5 pr-3 text-zinc-700">{d.date}</td>
                    <td className="py-1.5 pr-3 text-zinc-700">{formatNum(d.km, 1)}</td>
                    <td className="py-1.5 pr-3 text-zinc-900">{formatUah(d.amountUah)}</td>
                    <td className="py-1.5 pr-3 text-zinc-900">
                      {formatUah(d.fuelCompensationUah ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        emphasize ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <div className={`text-xs ${emphasize ? "text-zinc-300" : "text-zinc-500"}`}>{label}</div>
      <div className={`mt-0.5 text-lg font-semibold ${emphasize ? "text-white" : "text-zinc-900"}`}>
        {value}
      </div>
      {hint ? (
        <div className={`mt-0.5 text-xs ${emphasize ? "text-zinc-400" : "text-zinc-500"}`}>{hint}</div>
      ) : null}
    </div>
  );
}
