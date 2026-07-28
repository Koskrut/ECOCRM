"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, RefreshCw } from "lucide-react";
import {
  outboundApi,
  entityDisplayName,
  type OutboundAttempt,
  type OutboundAttemptStatus,
  type OutboundCampaign,
  type OutboundScenario,
} from "@/lib/api/resources/outbound";
import { OutboundStatusBadge } from "../_components/OutboundStatusBadge";
import { OutcomeBadge } from "../_components/OutcomeBadge";
import { formatDateTime } from "@/lib/crmDatetime";
import { OUTBOUND_STATUS_UA } from "@/lib/status-labels";

const PAGE_SIZE = 30;
const REFRESH_INTERVAL_MS = 30_000;

const ALL_STATUSES: OutboundAttemptStatus[] = [
  "PENDING",
  "QUEUED",
  "DIALING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
];

function formatDate(d: string) {
  return formatDateTime(d);
}

function CallLinkBadge({ callId }: { callId: string | null }) {
  if (callId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
        📞 Звʼязано
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-400">
      ⊘ No call
    </span>
  );
}

function ReviewBadge({ needsReview }: { needsReview?: boolean }) {
  if (!needsReview) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
      ⚠ Review
    </span>
  );
}

// ---- Filter popover ----

type FiltersState = {
  campaignId: string;
  status: string;
  scenarioCode: string;
  needsReview: string;
  callLinked: string;
};

const EMPTY_FILTERS: FiltersState = {
  campaignId: "",
  status: "",
  scenarioCode: "",
  needsReview: "",
  callLinked: "",
};

type PresetDef = {
  label: string;
  filters: Partial<FiltersState>;
};

const PRESETS: PresetDef[] = [
  { label: "⚠ Потребує перевірки", filters: { needsReview: "true" } },
  { label: "⊘ Без звʼязаного дзвінка", filters: { callLinked: "false", status: "COMPLETED" } },
  { label: "✓ Завершені", filters: { status: "COMPLETED" } },
  { label: "Реактивація сплячих", filters: { scenarioCode: "DORMANT_REACTIVATION" } },
  { label: "Кваліфікація лідів", filters: { scenarioCode: "LEAD_QUALIFICATION" } },
];

function isPresetActive(preset: PresetDef, filters: FiltersState): boolean {
  return Object.entries(preset.filters).every(
    ([k, v]) => filters[k as keyof FiltersState] === v,
  );
}

function FilterPresets({
  filters,
  onChange,
}: {
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((p) => {
        const active = isPresetActive(p, filters);
        return (
          <button
            key={p.label}
            type="button"
            onClick={() =>
              onChange(
                active ? { ...EMPTY_FILTERS } : { ...EMPTY_FILTERS, ...p.filters },
              )
            }
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50"
            }`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

function FiltersPopover({
  campaigns,
  scenarios,
  filters,
  onChange,
}: {
  campaigns: OutboundCampaign[];
  scenarios: OutboundScenario[];
  filters: FiltersState;
  onChange: (f: FiltersState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const activeCount = Object.values(filters).filter(Boolean).length;

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };
  const reset = () => {
    setDraft(EMPTY_FILTERS);
    onChange(EMPTY_FILTERS);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
          activeCount > 0
            ? "border-zinc-900 bg-zinc-900 text-white"
            : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Фільтри
        {activeCount > 0 && (
          <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-bold text-zinc-900">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-30 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Фільтри
          </p>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Кампанія</label>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                value={draft.campaignId}
                onChange={(e) => setDraft((d) => ({ ...d, campaignId: e.target.value }))}
              >
                <option value="">Усі</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Статус</label>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                value={draft.status}
                onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              >
                <option value="">Усі</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {OUTBOUND_STATUS_UA[s] ?? s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Сценарій</label>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                value={draft.scenarioCode}
                onChange={(e) => setDraft((d) => ({ ...d, scenarioCode: e.target.value }))}
              >
                <option value="">Усі</option>
                {scenarios.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">QA-перевірка</label>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                value={draft.needsReview}
                onChange={(e) => setDraft((d) => ({ ...d, needsReview: e.target.value }))}
              >
                <option value="">Усі</option>
                <option value="true">Потребує перевірки</option>
                <option value="false">OK</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs text-zinc-500">Звʼязок з дзвінком</label>
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
                value={draft.callLinked}
                onChange={(e) => setDraft((d) => ({ ...d, callLinked: e.target.value }))}
              >
                <option value="">Усі</option>
                <option value="true">Звʼязано з дзвінком</option>
                <option value="false">Без дзвінка</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-between gap-2">
            <button
              type="button"
              onClick={reset}
              className="text-xs text-zinc-400 hover:text-zinc-700"
            >
              Скинути
            </button>
            <button
              type="button"
              onClick={apply}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
            >
              Застосувати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Main page ----

export default function AttemptsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const getInitialFilters = (): FiltersState => ({
    campaignId: searchParams.get("campaignId") ?? "",
    status: searchParams.get("status") ?? "",
    scenarioCode: searchParams.get("scenarioCode") ?? "",
    needsReview: searchParams.get("needsReview") ?? "",
    callLinked: searchParams.get("callLinked") ?? "",
  });

  const [filters, setFilters] = useState<FiltersState>(getInitialFilters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OutboundAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [scenarios, setScenarios] = useState<OutboundScenario[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);
  const filtersRef = useRef(filters);
  const pageRef = useRef(page);

  useEffect(() => { filtersRef.current = filters; }, [filters]);
  useEffect(() => { pageRef.current = page; }, [page]);

  // load filter options once
  useEffect(() => {
    void outboundApi.listCampaigns().then(setCampaigns).catch(() => null);
    void outboundApi.listScenarios().then(setScenarios).catch(() => null);
  }, []);

  const loadAttempts = useCallback(
    async (f: FiltersState, p: number, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await outboundApi.listAttempts({
          page: p,
          pageSize: PAGE_SIZE,
          ...(f.campaignId && { campaignId: f.campaignId }),
          ...(f.status && { status: f.status }),
          ...(f.scenarioCode && { scenarioCode: f.scenarioCode }),
          ...(f.needsReview !== "" && { needsReview: f.needsReview === "true" }),
          ...(f.callLinked !== "" && { callLinked: f.callLinked === "true" }),
        });
        setItems(res.items);
        setTotal(res.total);
        setLastRefreshed(new Date());
      } catch (e) {
        if (!silent) {
          setError(
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              (e instanceof Error ? e.message : "Не вдалося завантажити спроби"),
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadAttempts(filters, page);
  }, [filters, page, loadAttempts]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (autoRefreshPaused) return;
    const id = setInterval(() => {
      void loadAttempts(filtersRef.current, pageRef.current, true);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefreshPaused, loadAttempts]);

  const handleFiltersChange = (f: FiltersState) => {
    setFilters(f);
    setPage(1);
    const params = new URLSearchParams();
    if (f.campaignId) params.set("campaignId", f.campaignId);
    if (f.status) params.set("status", f.status);
    if (f.scenarioCode) params.set("scenarioCode", f.scenarioCode);
    if (f.needsReview) params.set("needsReview", f.needsReview);
    if (f.callLinked) params.set("callLinked", f.callLinked);
    router.replace(`/outbound/attempts${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Presets row */}
      <div className="mb-3">
        <FilterPresets filters={filters} onChange={handleFiltersChange} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {loading ? "Завантаження…" : `${total} спроб`}
          {lastRefreshed && !loading && (
            <span className="ml-2 text-xs text-zinc-400">
              · updated {lastRefreshed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadAttempts(filters, page)}
            disabled={loading}
            title="Refresh now"
            className="rounded-lg border border-zinc-200 p-2 text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setAutoRefreshPaused((v) => !v)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
              autoRefreshPaused
                ? "border-zinc-300 text-zinc-500 hover:bg-zinc-50"
                : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            {autoRefreshPaused ? "Auto-refresh off" : "Auto 30s"}
          </button>
          <FiltersPopover
            campaigns={campaigns}
            scenarios={scenarios}
            filters={filters}
            onChange={handleFiltersChange}
          />
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-100/80 text-xs font-medium uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Контакт / телефон</th>
              <th className="px-4 py-3">Кампанія</th>
              <th className="px-4 py-3">Сценарій</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Результат</th>
              <th className="px-4 py-3">Прапорці</th>
              <th className="px-4 py-3">Оновлено</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-zinc-400">
                  Завантаження…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-3xl">📵</span>
                    <p className="font-medium text-zinc-700">Спроб не знайдено</p>
                    <p className="text-sm text-zinc-400">Спробуйте змінити фільтри.</p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer hover:bg-zinc-50/60"
                  onClick={() => router.push(`/outbound/attempts/${a.id}`)}
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900">{entityDisplayName(a)}</p>
                    <p className="text-xs text-zinc-400">{a.phoneNormalized}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{a.campaign?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {a.scenarioCode}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <OutboundStatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeBadge
                      outcomeKey={a.outcome?.outcomeKey}
                      bucket={a.outcome?.bucket}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <ReviewBadge needsReview={a.outcome?.analysis?.needsReview} />
                      <CallLinkBadge callId={a.callId} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {formatDate(a.updatedAt)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 hover:bg-zinc-50"
          >
            ← Prev
          </button>
          <span className="text-sm text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 disabled:opacity-40 hover:bg-zinc-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
