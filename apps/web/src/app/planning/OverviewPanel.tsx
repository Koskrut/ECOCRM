"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type KitPortfolioView,
  type PlanningTodayView,
} from "@/lib/api/resources/planning";
import { KitPortfolioPanel } from "./KitPortfolioPanel";

export function OverviewPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const ov = t.overview;
  const [portfolio, setPortfolio] = useState<KitPortfolioView | null>(null);
  const [today, setToday] = useState<PlanningTodayView | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [kitView, todayView] = await Promise.all([
        planningApi.getKitPortfolio(),
        planningApi.getToday(),
      ]);
      setPortfolio(kitView);
      setToday(todayView);
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.loadDashboard);
    } finally {
      setBusy(false);
    }
  }, [onError, t.errors.loadDashboard]);

  useEffect(() => {
    void load();
  }, [load]);

  const snap = portfolio?.freshness ?? today?.freshness.snapshot;
  const sales = portfolio?.salesFreshness ?? today?.freshness.sales;
  const draftTotal =
    (portfolio?.draftRequests.packing ?? 0) + (portfolio?.draftRequests.factory ?? 0);
  const awaitingGap = today?.awaitingStock.summary.gapSkuCount ?? 0;
  const mrpAt = today?.mrpComputedAt ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              snap?.isFresh ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {t.labels.snapshot1C}: {snap?.isFresh ? t.states.fresh : t.states.stale}
            {snap?.ageDays != null ? ` (${t.labels.ageDays(snap.ageDays)})` : ""}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              sales?.isFresh ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {t.labels.demandSource}:{" "}
            {!sales
              ? t.states.none
              : sales.isFresh
                ? t.states.ok
                : (sales.warning ?? t.states.stale)}
          </span>
          {mrpAt ? (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
              {t.labels.lastMrpRun}: {new Date(mrpAt).toLocaleString("uk-UA")}
            </span>
          ) : null}
          {awaitingGap > 0 ? (
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">
              {ov.awaitingTitle}: {awaitingGap}
            </span>
          ) : null}
          {draftTotal > 0 ? (
            <Link
              href="/planning?tab=factory"
              className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-800 underline"
            >
              {ov.draftsHint(
                portfolio?.draftRequests.packing ?? 0,
                portfolio?.draftRequests.factory ?? 0,
              )}
            </Link>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="ml-auto rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={() => void load()}
          >
            {t.actions.refresh}
          </button>
        </div>
        {(today?.dueReminders?.length ?? 0) > 0 ? (
          <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
            {(today?.dueReminders ?? []).slice(0, 5).map((item) => (
              <p key={item.id} className="text-sm text-amber-900">
                {item.label}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      <KitPortfolioPanel
        onError={onError}
        view={portfolio}
        busy={busy}
        onReload={load}
      />
    </div>
  );
}
