"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  outboundApi,
  entityDisplayName,
  type OutboundAttempt,
  type OutboundCampaign,
  type OutboundScenario,
} from "@/lib/api/resources/outbound";
import { OutboundStatusBadge } from "../_components/OutboundStatusBadge";
import { OutcomeBadge } from "../_components/OutcomeBadge";
import { formatDateTime } from "@/lib/crmDatetime";

const PAGE_SIZE = 30;
const REFRESH_INTERVAL_MS = 30_000;

function formatDate(d: string) {
  return formatDateTime(d);
}

function ReviewSummaryBar({
  total,
  items,
}: {
  total: number;
  items: OutboundAttempt[];
}) {
  const bySource = items.reduce<Record<string, number>>((acc, a) => {
    const src = a.outcome?.analysis?.analysisSource ?? "UNKNOWN";
    acc[src] = (acc[src] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚠</span>
        <span className="text-sm font-semibold text-amber-800">
          {total} attempt{total !== 1 ? "s" : ""} need review
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(bySource).map(([src, count]) => (
          <span
            key={src}
            className="rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-xs text-amber-700"
          >
            {count} {src.toLowerCase().replace(/_/g, " ")}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [campaignFilter, setCampaignFilter] = useState("");
  const [scenarioFilter, setScenarioFilter] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<OutboundAttempt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [scenarios, setScenarios] = useState<OutboundScenario[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [autoRefreshPaused, setAutoRefreshPaused] = useState(false);

  const campaignRef = useRef(campaignFilter);
  const scenarioRef = useRef(scenarioFilter);
  const pageRef = useRef(page);
  useEffect(() => { campaignRef.current = campaignFilter; }, [campaignFilter]);
  useEffect(() => { scenarioRef.current = scenarioFilter; }, [scenarioFilter]);
  useEffect(() => { pageRef.current = page; }, [page]);

  useEffect(() => {
    void outboundApi.listCampaigns().then(setCampaigns).catch(() => null);
    void outboundApi.listScenarios().then(setScenarios).catch(() => null);
  }, []);

  const loadReview = useCallback(
    async (campaignId: string, scenarioCode: string, p: number, silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await outboundApi.listAttempts({
          needsReview: true,
          page: p,
          pageSize: PAGE_SIZE,
          ...(campaignId && { campaignId }),
          ...(scenarioCode && { scenarioCode }),
        });
        setItems(res.items);
        setTotal(res.total);
        setLastRefreshed(new Date());
      } catch (e) {
        if (!silent) {
          setError(
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              (e instanceof Error ? e.message : "Не вдалося завантажити елементи на перевірку"),
          );
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadReview(campaignFilter, scenarioFilter, page);
  }, [campaignFilter, scenarioFilter, page, loadReview]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (autoRefreshPaused) return;
    const id = setInterval(() => {
      void loadReview(campaignRef.current, scenarioRef.current, pageRef.current, true);
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefreshPaused, loadReview]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {!loading && total > 0 && <ReviewSummaryBar total={total} items={items} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {loading ? "Завантаження…" : `${total} елементів потребують перевірки`}
          {lastRefreshed && !loading && (
            <span className="ml-2 text-xs text-zinc-400">
              · {lastRefreshed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            value={campaignFilter}
            onChange={(e) => {
              setCampaignFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            value={scenarioFilter}
            onChange={(e) => {
              setScenarioFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All scenarios</option>
            {scenarios.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void loadReview(campaignFilter, scenarioFilter, page)}
            disabled={loading}
            title="Refresh now"
            className="rounded-lg border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-50 disabled:opacity-40"
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
              <th className="px-4 py-3">Contact / Phone</th>
              <th className="px-4 py-3">Campaign</th>
              <th className="px-4 py-3">Scenario</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Outcome</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-zinc-400">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-4xl">✅</span>
                    <p className="font-medium text-zinc-700">Nothing to review</p>
                    <p className="text-sm text-zinc-400">
                      All completed calls look good or there are no completed attempts yet.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((a) => (
                <tr
                  key={a.id}
                  className="cursor-pointer border-l-2 border-amber-400 hover:bg-amber-50/40"
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
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                      {a.outcome?.analysis?.analysisSource
                        ?.toLowerCase()
                        .replace(/_/g, " ") ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400">
                    {formatDate(a.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs font-medium text-zinc-500 hover:text-zinc-800">
                      Open →
                    </span>
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
