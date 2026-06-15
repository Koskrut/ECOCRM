"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiHttp } from "@/lib/api/client";
import {
  getDefaultCustomRange,
  getDatesForPreset,
  type RangePreset,
} from "./analytics-period.util";

type Employee = {
  id: string;
  fullName?: string | null;
  email?: string;
  role?: "ADMIN" | "LEAD" | "MANAGER" | "USER";
};

type UsersResponse = {
  items?: Employee[];
};

export type ManagerOption = {
  id: string;
  fullName: string;
};

type AnalyticsFiltersBarProps = {
  dateFrom: string;
  dateTo: string;
  managerId: string;
  managers: ManagerOption[];
  rangePreset: RangePreset;
  comparePrev: boolean;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onManagerIdChange: (value: string) => void;
  onRangePresetChange: (preset: RangePreset) => void;
  onComparePrevChange: (value: boolean) => void;
};

type SimpleTableColumn<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
};

function pickErrorMessage(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { message?: string; error?: string } } };
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    (error instanceof Error ? error.message : fallback)
  );
}

function urlSearchParamsEqual(a: URLSearchParams, b: URLSearchParams): boolean {
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const k of keys) {
    if ((a.get(k) ?? "") !== (b.get(k) ?? "")) return false;
  }
  return true;
}

import type { BaseCurrency } from "@/lib/base-currency";
import { baseCurrencySymbol } from "@/lib/base-currency";

export function formatMoneyBase(
  value: number | null | undefined,
  currency: BaseCurrency | string = "USD",
): string {
  const amount = Number(value ?? 0);
  const sym = baseCurrencySymbol(currency);
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(amount)} ${sym}`;
}

export function formatMoneyBaseFine(
  value: number | null | undefined,
  currency: BaseCurrency | string = "USD",
): string {
  const amount = Number(value ?? 0);
  const sym = baseCurrencySymbol(currency);
  return `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)} ${sym}`;
}

/** @deprecated Prefer formatMoneyBase with currency from API. Kept for Payment.amountUsd (always USD). */
export function formatMoneyUsd(value: number | null | undefined): string {
  return formatMoneyBase(value, "USD");
}

/** @deprecated Prefer formatMoneyBaseFine with currency from API. */
export function formatMoneyUsdFine(value: number | null | undefined): string {
  return formatMoneyBaseFine(value, "USD");
}

export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  const digits = Number.isInteger(amount) ? 0 : 2;
  return `${amount.toFixed(digits)} %`;
}

export function useAnalyticsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const defaults = useMemo(() => getDefaultCustomRange(), []);

  const [dateFrom, setDateFromState] = useState(defaults.dateFrom);
  const [dateTo, setDateToState] = useState(defaults.dateTo);
  const [managerId, setManagerIdState] = useState("");
  const [rangePreset, setRangePresetState] = useState<RangePreset>("custom");
  const [comparePrev, setComparePrevState] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  // Prevent immediate re-sync after our own router.replace.
  const lastPushedQueryRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (lastPushedQueryRef.current && lastPushedQueryRef.current === searchKey) {
      lastPushedQueryRef.current = null;
      return;
    }
    const params = new URLSearchParams(searchKey);
    const df = params.get("dateFrom");
    const dt = params.get("dateTo");
    const presetRaw = params.get("preset") as RangePreset | null;
    const preset =
      presetRaw === "week" || presetRaw === "month" || presetRaw === "quarter" ? presetRaw : null;

    let nextRangePreset: RangePreset = preset ?? "custom";

    if (df && dt) {
      setDateFromState((prev) => (prev !== df ? df : prev));
      setDateToState((prev) => (prev !== dt ? dt : prev));
      // `preset` in the URL can lag after the user edits dates; only keep the preset if it still matches.
      if (preset) {
        const canonical = getDatesForPreset(preset);
        nextRangePreset = df === canonical.dateFrom && dt === canonical.dateTo ? preset : "custom";
      } else {
        nextRangePreset = "custom";
      }
    } else if (preset) {
      const r = getDatesForPreset(preset);
      setDateFromState((prev) => (prev !== r.dateFrom ? r.dateFrom : prev));
      setDateToState((prev) => (prev !== r.dateTo ? r.dateTo : prev));
      nextRangePreset = preset;
    }

    const mid = params.get("managerId") ?? "";
    const cmp = params.get("compare") === "prev_period";

    setManagerIdState((prev) => (prev !== mid ? mid : prev));
    setComparePrevState((prev) => (prev !== cmp ? cmp : prev));
    setRangePresetState((prev) => (prev !== nextRangePreset ? nextRangePreset : prev));
  }, [searchKey]);

  useEffect(() => {
    let active = true;
    apiHttp
      .get<UsersResponse | Employee[]>("/users")
      .then((res) => {
        if (!active) return;
        const payload = res.data;
        const list = Array.isArray(payload) ? payload : (payload?.items ?? []);
        const options = list
          .filter((item) => item.role === "MANAGER")
          .map((item) => ({
            id: item.id,
            fullName: item.fullName?.trim() || item.email || item.id,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName, "uk"));
        setManagers(options);
      })
      .catch(() => {
        if (active) setManagers([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const setDateFrom = useCallback((value: string) => {
    setDateFromState(value);
    setRangePresetState("custom");
  }, []);

  const setDateTo = useCallback((value: string) => {
    setDateToState(value);
    setRangePresetState("custom");
  }, []);

  const setManagerId = useCallback((value: string) => {
    setManagerIdState(value);
  }, []);

  const setRangePreset = useCallback((preset: RangePreset) => {
    setRangePresetState(preset);
    if (preset === "custom") return;
    const r = getDatesForPreset(preset);
    setDateFromState(r.dateFrom);
    setDateToState(r.dateTo);
  }, []);

  const setComparePrev = useCallback((value: boolean) => {
    setComparePrevState(value);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
    params.set("period", "custom");
    if (managerId) params.set("managerId", managerId);
    if (comparePrev) params.set("compare", "prev_period");
    if (rangePreset !== "custom") params.set("preset", rangePreset);
    const current = new URLSearchParams(searchKey);
    if (urlSearchParamsEqual(params, current)) return;
    const nextQuery = params.toString();
    lastPushedQueryRef.current = nextQuery;
    router.replace(`${pathname}?${nextQuery}`, { scroll: false });
  }, [dateFrom, dateTo, managerId, comparePrev, rangePreset, pathname, router, searchKey]);

  const querySuffix = useMemo(() => {
    const params = new URLSearchParams();
    params.set("dateFrom", dateFrom);
    params.set("dateTo", dateTo);
    params.set("period", "custom");
    if (managerId) params.set("managerId", managerId);
    if (comparePrev) params.set("compare", "prev_period");
    return `?${params.toString()}`;
  }, [dateFrom, dateTo, managerId, comparePrev]);

  return {
    dateFrom,
    dateTo,
    managerId,
    managers,
    rangePreset,
    comparePrev,
    querySuffix,
    setDateFrom,
    setDateTo,
    setManagerId,
    setRangePreset,
    setComparePrev,
  };
}

export function useAnalyticsFetch<T>(endpoint: string, querySuffix: string, refreshKey = 0) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiHttp
      .get<T>(`/analytics/${endpoint}${querySuffix}`, {
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      })
      .then((res) => {
        if (!active) return;
        setData(res.data);
      })
      .catch((err) => {
        if (!active) return;
        setData(null);
        setError(pickErrorMessage(err, `Failed to load ${endpoint}`));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [endpoint, querySuffix, refreshKey]);

  return { data, loading, error };
}

export function AnalyticsFiltersBar({
  dateFrom,
  dateTo,
  managerId,
  managers,
  rangePreset,
  comparePrev,
  onDateFromChange,
  onDateToChange,
  onManagerIdChange,
  onRangePresetChange,
  onComparePrevChange,
}: AnalyticsFiltersBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <label className="flex min-w-[160px] flex-col gap-1 text-sm text-zinc-700">
        <span>Період</span>
        <select
          value={rangePreset}
          onChange={(e) => onRangePresetChange(e.target.value as RangePreset)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        >
          <option value="custom">Свій діапазон</option>
          <option value="week">7 днів</option>
          <option value="month">30 днів</option>
          <option value="quarter">Квартал</option>
        </select>
      </label>
      <label className="flex min-w-[170px] flex-col gap-1 text-sm text-zinc-700">
        <span>З</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
      </label>
      <label className="flex min-w-[170px] flex-col gap-1 text-sm text-zinc-700">
        <span>По</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        />
      </label>
      <label className="flex min-w-[220px] flex-col gap-1 text-sm text-zinc-700">
        <span>Менеджер</span>
        <select
          value={managerId}
          onChange={(e) => onManagerIdChange(e.target.value)}
          className="rounded-lg border border-zinc-300 px-3 py-2"
        >
          <option value="">Усі менеджери</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.fullName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={comparePrev}
          onChange={(e) => onComparePrevChange(e.target.checked)}
          className="rounded border-zinc-300"
        />
        <span>Порівняти з попереднім періодом</span>
      </label>
    </div>
  );
}

export function KpiCard({
  title,
  value,
  subtitle,
  href,
  onDrill,
  drillLabel = "Докладніше →",
}: {
  title: string;
  value: string;
  subtitle?: string;
  href?: string;
  onDrill?: () => void;
  drillLabel?: string;
}) {
  const content = (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-zinc-500">{subtitle}</div> : null}
      {onDrill ? <div className="mt-2 text-xs font-medium text-zinc-600">{drillLabel}</div> : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block transition-transform hover:-translate-y-0.5">
        {content}
      </Link>
    );
  }
  if (onDrill) {
    return (
      <button
        type="button"
        onClick={onDrill}
        className="block w-full cursor-pointer text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-xl"
      >
        {content}
      </button>
    );
  }
  return content;
}

const kpiVariantClass: Record<"money" | "count" | "risk" | "percent", string> = {
  money: "border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white",
  count: "border-slate-200 bg-slate-50/40",
  risk: "border-amber-200/90 bg-amber-50/35",
  percent: "border-violet-200/80 bg-violet-50/40",
};

export function KpiDeltaCard({
  title,
  value,
  subtitle,
  tooltip,
  variant,
  deltaLabel,
  onDrill,
  drillLabel = "Докладніше →",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tooltip?: string;
  variant: "money" | "count" | "risk" | "percent";
  deltaLabel?: string | null;
  onDrill?: () => void;
  drillLabel?: string;
}) {
  const content = (
    <div className={`rounded-xl border p-4 shadow-sm ${kpiVariantClass[variant]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
        {tooltip ? (
          <span title={tooltip} className="cursor-help text-xs text-zinc-400" aria-label={tooltip}>
            ⓘ
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-zinc-600">{subtitle}</div> : null}
      {deltaLabel ? (
        <div className="mt-2 text-sm font-medium text-zinc-700">{deltaLabel}</div>
      ) : null}
      {onDrill ? <div className="mt-2 text-xs font-medium text-zinc-600">{drillLabel}</div> : null}
    </div>
  );
  if (onDrill) {
    return (
      <button
        type="button"
        onClick={onDrill}
        className="block w-full cursor-pointer text-left transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-xl"
      >
        {content}
      </button>
    );
  }
  return content;
}

export function AnalyticsOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100"
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100" />
        <div className="h-72 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100" />
      <div className="h-40 animate-pulse rounded-xl border border-zinc-200 bg-zinc-100" />
    </div>
  );
}

export function AnalyticsErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-50"
        >
          Спробувати знову
        </button>
      ) : null}
    </div>
  );
}

export function SimpleTable<T>({
  rows,
  columns,
  emptyText = "Немає даних",
}: {
  rows: T[];
  columns: SimpleTableColumn<T>[];
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-medium">
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-zinc-500" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={index} className="border-t border-zinc-100">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3 text-zinc-800">
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalyticsState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
        Завантаження...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error}
      </div>
    );
  }
  return <>{children}</>;
}
