"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type KitPortfolioView,
  type PlanningTodayView,
  type StockoutRow,
} from "@/lib/api/resources/planning";
import { KitPortfolioPanel } from "./KitPortfolioPanel";

type KpiDrilldown = "zero" | "paretoZero" | "packable" | "awaiting" | "drafts" | null;

function KpiCard({
  title,
  value,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left shadow-sm transition hover:border-cyan-300 ${
        active ? "border-cyan-500 bg-cyan-50/50" : "border-zinc-200 bg-white"
      }`}
    >
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
    </button>
  );
}

function StockoutTable({ rows, noDataLabel }: { rows: StockoutRow[]; noDataLabel: string }) {
  const t = strings.planning;
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">{noDataLabel}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {[t.labels.sku, t.labels.name, t.labels.kind, t.overview.paretoCol].map((h) => (
              <th key={h} className="px-3 py-2 text-left font-medium text-zinc-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <tr key={row.productId}>
              <td className="px-3 py-2 text-zinc-900">{row.sku}</td>
              <td className="px-3 py-2 text-zinc-900">{row.name}</td>
              <td className="px-3 py-2 text-zinc-700">{row.kind === "KIT" ? t.overview.kindKit : t.overview.kindPart}</td>
              <td className="px-3 py-2 text-zinc-700">
                {row.inPareto80 ? t.overview.inPareto80 : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OverviewPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const ov = t.overview;
  const [portfolio, setPortfolio] = useState<KitPortfolioView | null>(null);
  const [today, setToday] = useState<PlanningTodayView | null>(null);
  const [busy, setBusy] = useState(false);
  const [drilldown, setDrilldown] = useState<KpiDrilldown>(null);

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

  const paretoZeroRows = useMemo(() => {
    if (!portfolio) return [];
    return [
      ...portfolio.stockouts.zeroKits.filter((k) => k.inPareto80),
      ...portfolio.stockouts.zeroParts.filter((p) => p.inPareto80),
    ];
  }, [portfolio]);

  const draftTotal =
    (portfolio?.draftRequests.packing ?? 0) + (portfolio?.draftRequests.factory ?? 0);

  const toggleDrill = (key: KpiDrilldown) => {
    setDrilldown((prev) => (prev === key ? null : key));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
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
            {t.labels.sales18m}:{" "}
            {!sales?.uploadId
              ? t.states.noSales
              : sales.isFresh
                ? t.states.ok
                : t.states.stale}
          </span>
          <button
            type="button"
            disabled={busy}
            className="ml-auto rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={() => void load()}
          >
            {t.actions.refresh}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          title={ov.zeroStockTitle}
          value={String(portfolio?.stockouts.zeroCount ?? "—")}
          subtitle={ov.zeroStockHint}
          active={drilldown === "zero"}
          onClick={() => toggleDrill("zero")}
        />
        <KpiCard
          title={ov.paretoZeroTitle}
          value={String(portfolio?.stockouts.paretoZeroCount ?? "—")}
          subtitle={ov.paretoZeroHint}
          active={drilldown === "paretoZero"}
          onClick={() => toggleDrill("paretoZero")}
        />
        <KpiCard
          title={ov.packableTitle}
          value={String(portfolio?.summary.packableToday ?? "—")}
          subtitle={ov.packableHint(
            portfolio?.summary.blocked ?? 0,
            portfolio?.summary.packableAllKits,
          )}
          active={drilldown === "packable"}
          onClick={() => toggleDrill("packable")}
        />
        <KpiCard
          title={ov.awaitingTitle}
          value={String(today?.awaitingStock.summary.gapSkuCount ?? "—")}
          subtitle={ov.awaitingHint(
            today?.awaitingStock.summary.gapSkuCount ?? 0,
            today?.awaitingStock.summary.gapQty ?? 0,
            today?.awaitingStock.summary.coveredSkuCount ?? 0,
          )}
          active={drilldown === "awaiting"}
          onClick={() => toggleDrill("awaiting")}
        />
        <KpiCard
          title={ov.draftsTitle}
          value={String(draftTotal || "—")}
          subtitle={ov.draftsHint(
            portfolio?.draftRequests.packing ?? 0,
            portfolio?.draftRequests.factory ?? 0,
          )}
          active={drilldown === "drafts"}
          onClick={() => toggleDrill("drafts")}
        />
      </div>

      {drilldown === "zero" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-zinc-900">{ov.zeroStockTitle}</h3>
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              {ov.zeroFinishedBlockedTitle} ({portfolio?.stockouts.zeroFinishedBlocked.length ?? 0})
            </h4>
            <StockoutTable
              rows={portfolio?.stockouts.zeroFinishedBlocked ?? []}
              noDataLabel={ov.noZeroStock}
            />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              {ov.zeroFinishedBuildableTitle} ({portfolio?.stockouts.zeroFinishedBuildable.length ?? 0})
            </h4>
            <StockoutTable
              rows={portfolio?.stockouts.zeroFinishedBuildable ?? []}
              noDataLabel={ov.noZeroStock}
            />
          </div>
          <div>
            <h4 className="mb-2 text-xs font-medium uppercase text-zinc-500">
              {t.overview.kindPart} ({portfolio?.stockouts.zeroParts.length ?? 0})
            </h4>
            <StockoutTable rows={portfolio?.stockouts.zeroParts ?? []} noDataLabel={ov.noZeroStock} />
          </div>
        </div>
      ) : null}

      {drilldown === "paretoZero" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">{ov.paretoZeroTitle}</h3>
          <StockoutTable rows={paretoZeroRows} noDataLabel={ov.noParetoZero} />
        </div>
      ) : null}

      {drilldown === "packable" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-700">
            {ov.packableDetail(
              portfolio?.summary.packableToday ?? 0,
              portfolio?.summary.blocked ?? 0,
              portfolio?.summary.packableAllKits,
            )}
          </p>
          <Link
            href="/planning?tab=requests&kind=pack"
            className="mt-2 inline-block text-sm text-cyan-700 underline"
          >
            {ov.openPackRequests}
          </Link>
        </div>
      ) : null}

      {drilldown === "awaiting" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm text-zinc-600">
            {ov.awaitingHint(
              today?.awaitingStock.summary.gapSkuCount ?? 0,
              today?.awaitingStock.summary.gapQty ?? 0,
              today?.awaitingStock.summary.coveredSkuCount ?? 0,
            )}
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm">
              <thead>
                <tr className="bg-zinc-50">
                  {[t.labels.sku, t.labels.name, t.labels.packNeed, t.labels.finishedGap].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium text-zinc-600">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(today?.awaitingStock.groups ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-zinc-500">
                      {t.states.none}
                    </td>
                  </tr>
                ) : (
                  (today?.awaitingStock.groups ?? []).map((g) => (
                    <tr key={g.groupKey}>
                      <td className="px-3 py-2">{g.sku}</td>
                      <td className="px-3 py-2">{g.name}</td>
                      <td className="px-3 py-2">{g.totalQtyRemaining}</td>
                      <td className="px-3 py-2">{g.stockGap}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {drilldown === "drafts" ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-700">{ov.draftsDetail(draftTotal)}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {(portfolio?.draftRequests.packing ?? 0) > 0 ? (
              <Link
                href="/planning?tab=requests&kind=pack"
                className="text-sm text-cyan-700 underline"
              >
                {ov.openPackDrafts(portfolio?.draftRequests.packing ?? 0)}
              </Link>
            ) : null}
            {(portfolio?.draftRequests.factory ?? 0) > 0 ? (
              <Link
                href="/planning?tab=requests&kind=factory"
                className="text-sm text-cyan-700 underline"
              >
                {ov.openFactoryDrafts(portfolio?.draftRequests.factory ?? 0)}
              </Link>
            ) : null}
            {draftTotal === 0 ? (
              <p className="text-sm text-zinc-500">{t.states.none}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <KitPortfolioPanel
        onError={onError}
        view={portfolio}
        busy={busy}
        onReload={load}
      />
    </div>
  );
}
