"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { strings } from "@/locales";
import {
  planningApi,
  type FactoryOrder,
  type FactoryRecommendation,
  type MrpForecastView,
  type MrpRun,
  type MrpRunLine,
  type PackingList,
  type PlanningCapacityConfig,
  type PlanningDashboard,
  type PlanningHorizonConfig,
  type PlanningSettings,
  type SalesFreshness,
  type SnapshotFreshness,
  type StockProjection,
} from "@/lib/api/resources/planning";
import { formatDateTime } from "@/lib/crmDatetime";
import { planningCycleStatusLabel } from "@/lib/status-labels";

function useStableErrorHandler(onError: (msg: string) => void) {
  const ref = useRef(onError);
  ref.current = onError;
  return useCallback((msg: string) => {
    ref.current(msg);
  }, []);
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {title ? <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2> : null}
      {children}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-sm font-medium text-zinc-900">{value}</p>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  noDataLabel,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
  noDataLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 text-left font-medium text-zinc-600">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-zinc-500" colSpan={headers.length}>
                {noDataLabel}
              </td>
            </tr>
          ) : (
            rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {row.map((cell, cellIdx) => (
                  <td key={`${rowIdx}-${cellIdx}`} className="px-3 py-2 align-top text-zinc-900">
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PlanningHowToPanel({ open }: { open: boolean }) {
  const t = strings.planning;
  if (!open) return null;
  return (
    <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{t.howTo.title}</h2>
          <p className="mt-1 text-sm text-zinc-700">{t.howTo.intro}</p>
        </div>
        <Link
          href="/help/planning-mrp-guide"
          className="shrink-0 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700"
        >
          {t.actions.openFullGuide}
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t.howTo.stepsTitle}
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-zinc-800">
            {t.howTo.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t.howTo.tabsTitle}
            </p>
            <p className="mt-2 text-sm text-zinc-800">{t.howTo.tabsHint}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              {t.howTo.tipTitle}
            </p>
            <p className="mt-1 text-sm text-amber-950">{t.howTo.tipBody}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FreshnessBanner({ freshness }: { freshness: SnapshotFreshness | null }) {
  const t = strings.planning;
  if (!freshness) return null;
  const ok = freshness.isFresh;
  return (
    <div
      className={
        ok
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      }
    >
      {ok ? t.messages.freshnessOk : freshness.warning ?? t.messages.freshnessWarn}
      {freshness.postedAt ? (
        <span className="ml-2 text-zinc-600">
          ({formatDateTime(freshness.postedAt)}
          {freshness.ageDays != null ? `, ${t.labels.ageDays(freshness.ageDays)}` : ""})
        </span>
      ) : null}
    </div>
  );
}

export function SalesFreshnessBanner({ freshness }: { freshness: SalesFreshness | null }) {
  const t = strings.planning;
  if (!freshness) return null;
  const ok = freshness.isFresh;
  return (
    <div
      className={
        ok
          ? "rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
          : "rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
      }
    >
      {ok ? t.messages.salesFreshnessOk : freshness.warning ?? t.messages.salesFreshnessWarn}
      {freshness.postedAt ? (
        <span className="ml-2 text-zinc-600">
          ({formatDateTime(freshness.postedAt)}
          {freshness.ageDays != null ? `, ${t.labels.ageDays(freshness.ageDays)}` : ""})
        </span>
      ) : null}
    </div>
  );
}

export function PlanningFreshnessBanners({
  snapshot,
  sales,
}: {
  snapshot: SnapshotFreshness | null;
  sales: SalesFreshness | null;
}) {
  return (
    <div className="space-y-2">
      <FreshnessBanner freshness={snapshot} />
      <SalesFreshnessBanner freshness={sales} />
    </div>
  );
}

export function PlanningDashboardPanel({
  dashboard,
  projection,
}: {
  dashboard: PlanningDashboard | null;
  projection: StockProjection | null;
}) {
  const t = strings.planning;
  if (!dashboard) return <p className="text-sm text-zinc-500">{t.states.noData}</p>;
  const dash = t.states.none;
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.dashboardHint}</p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t.labels.daysOfCover}
          value={dashboard.overallDaysOfCover != null ? String(dashboard.overallDaysOfCover) : dash}
        />
        <StatCard
          title={t.labels.packCapacity}
          value={`${dashboard.latestApprovedPacking?.capacityUsed ?? dashboard.latestDraftPacking?.capacityUsed ?? 0} / ${dashboard.packCapacityPerCycle}`}
        />
        <StatCard title={t.labels.openFactoryOrders} value={String(dashboard.openFactoryOrders)} />
        <StatCard title={t.labels.bottleneckRisks} value={String(dashboard.bottleneckRiskCount)} />
      </div>
      <Panel title={t.labels.daysOfCover}>
        <SimpleTable
          headers={[t.labels.sku, t.labels.name, t.labels.available, t.labels.daysOfCover, t.labels.maxBuildNow]}
          rows={dashboard.kitCoverage.map((row) => [
            row.sku,
            row.name,
            String(row.stock),
            row.daysOfCover != null ? String(row.daysOfCover) : dash,
            String(row.maxBuildNow),
          ])}
          noDataLabel={t.states.noData}
        />
      </Panel>
      <Panel title={t.labels.projection}>
        <SimpleTable
          headers={[t.labels.week, t.labels.kitsTotal, t.labels.partsTotal, t.labels.daysOfCover]}
          rows={(projection?.points ?? []).map((p) => [
            String(p.week),
            String(p.kitsTotal),
            String(p.partsTotal),
            p.kitDaysOfCover != null ? String(p.kitDaysOfCover) : dash,
          ])}
          noDataLabel={t.states.noData}
        />
      </Panel>
    </div>
  );
}

export function ForecastPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [view, setView] = useState<MrpForecastView | null>(null);
  const [stagedUploadId, setStagedUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [unresolvedSku, setUnresolvedSku] = useState<string[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setView(await planningApi.getMrpForecast());
      setStagedUploadId(null);
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.forecast);
    } finally {
      setBusy(false);
    }
  }, [reportError, t.errors.forecast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = (view?.rows ?? []).filter((r) => r.avgMonthlySold > 0 || r.forecastDemand > 0);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.forecastHint}</p>
      <SalesFreshnessBanner freshness={view?.salesFreshness ?? null} />
      <Panel title={t.messages.salesHistoryHint}>
        <div className="flex flex-wrap items-end gap-3">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={!file || busy}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => {
              if (!file) return;
              void (async () => {
                setBusy(true);
                try {
                  const res = await planningApi.uploadSalesHistory(file);
                  setStagedUploadId(res.upload.id);
                  setUnresolvedSku(res.unresolvedSku);
                  setUploadInfo(
                    t.messages.salesStagedResult(
                      res.importedRows,
                      res.resolvedRows,
                      res.unresolvedSku.length,
                    ),
                  );
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.forecast);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.uploadSalesHistory}
          </button>
          {stagedUploadId ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-cyan-600 bg-white px-4 py-2 text-sm font-medium text-cyan-700 disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await planningApi.postSalesHistory(stagedUploadId);
                    setUploadInfo(t.messages.salesPostedOk);
                    setStagedUploadId(null);
                    await load();
                  } catch (e) {
                    reportError(e instanceof Error ? e.message : t.errors.forecast);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t.actions.postSalesHistory}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
            onClick={() => void load()}
          >
            {t.actions.refresh}
          </button>
        </div>
        {uploadInfo ? <p className="mt-2 text-sm text-zinc-600">{uploadInfo}</p> : null}
        {unresolvedSku.length > 0 ? (
          <p className="mt-1 text-sm text-amber-800">
            {t.labels.unresolvedSku}: {unresolvedSku.slice(0, 20).join(", ")}
            {unresolvedSku.length > 20 ? ` (+${unresolvedSku.length - 20})` : ""}
          </p>
        ) : null}
      </Panel>
      <Panel title={t.labels.forecastFromSales}>
        <SimpleTable
          headers={[
            t.labels.sku,
            t.labels.name,
            t.labels.avgMonthly,
            t.labels.forecastHorizon,
            t.labels.safetyStock,
          ]}
          rows={rows.map((r) => [
            r.sku,
            r.name,
            String(Math.round(r.avgMonthlySold)),
            String(r.forecastDemand),
            String(r.safetyStock),
          ])}
          noDataLabel={t.states.noPostedSales}
        />
      </Panel>
    </div>
  );
}

export function PackingPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [lists, setLists] = useState<PackingList[]>([]);
  const [active, setActive] = useState<PackingList | null>(null);
  const [busy, setBusy] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});

  const applyActive = useCallback((full: PackingList) => {
    setActive(full);
    setQtys(
      Object.fromEntries((full.lines ?? []).map((l) => [l.kitProductId, String(l.qtyApproved)])),
    );
  }, []);

  const reloadLists = useCallback(async () => {
    setLists(await planningApi.listPackingLists(30));
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await reloadLists();
      } catch (e) {
        reportError(e instanceof Error ? e.message : t.errors.packing);
      }
    })();
  }, [reportError, reloadLists, t.errors.packing]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.packingHint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await planningApi.proposePackingList();
                applyActive(res.list);
                await reloadLists();
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.packing);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t.actions.proposePacking}
        </button>
        {active?.status === "DRAFT" ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const lines = Object.entries(qtys).map(([kitProductId, qty]) => ({
                      kitProductId,
                      qtyApproved: Number(qty) || 0,
                    }));
                    const updated = await planningApi.updatePackingLines(active.id, lines);
                    applyActive(updated);
                    await reloadLists();
                  } catch (e) {
                    reportError(e instanceof Error ? e.message : t.errors.packing);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t.actions.savePackingLines}
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    applyActive(await planningApi.approvePackingList(active.id));
                    await reloadLists();
                  } catch (e) {
                    reportError(e instanceof Error ? e.message : t.errors.packing);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              {t.actions.approvePacking}
            </button>
          </>
        ) : null}
        {active?.status === "APPROVED" ? (
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  applyActive(await planningApi.markPackingDone(active.id));
                  await reloadLists();
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.packing);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.markPackingDone}
          </button>
        ) : null}
        {active ? (
          <button
            type="button"
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
            onClick={() =>
              void planningApi.exportPackingList(active.id).catch((e) => reportError(String(e)))
            }
          >
            {t.actions.exportExcel}
          </button>
        ) : null}
      </div>

      <Panel title={t.tabs.packing}>
        <SimpleTable
          headers={[t.labels.status, t.labels.capacityUsed, t.labels.createdAt, t.labels.actions]}
          rows={lists.map((list) => [
            list.status,
            `${list.capacityUsed} / ${list.capacityLimit}`,
            formatDateTime(list.createdAt),
            <button
              key={list.id}
              type="button"
              className="text-cyan-700 underline"
              onClick={() => {
                void (async () => {
                  try {
                    applyActive(await planningApi.getPackingList(list.id));
                  } catch (e) {
                    reportError(e instanceof Error ? e.message : t.errors.packing);
                  }
                })();
              }}
            >
              {t.actions.open}
            </button>,
          ])}
          noDataLabel={t.states.noPackingLists}
        />
      </Panel>

      {active ? (
        <Panel title={`${planningCycleStatusLabel(active.status)} · ${formatDateTime(active.cycleStart)}`}>
          <SimpleTable
            headers={[
              t.labels.sku,
              t.labels.qtySuggested,
              t.labels.qtyApproved,
              t.labels.maxFromParts,
              t.labels.hardShort,
              t.labels.forecast14,
            ]}
            rows={(active.lines ?? []).map((line) => [
              `${line.kitProduct.sku} — ${line.kitProduct.name}`,
              String(line.qtySuggested),
              active.status === "DRAFT" ? (
                <input
                  key={line.id}
                  className="w-24 rounded border border-zinc-200 px-2 py-1"
                  value={qtys[line.kitProductId] ?? String(line.qtyApproved)}
                  onChange={(e) =>
                    setQtys((prev) => ({ ...prev, [line.kitProductId]: e.target.value }))
                  }
                />
              ) : (
                String(line.qtyApproved)
              ),
              String(line.maxFromParts),
              String(line.hardNeed),
              String(line.forecastNeed),
            ])}
            noDataLabel={t.states.noData}
          />
        </Panel>
      ) : null}
    </div>
  );
}

export function FactoryPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [recs, setRecs] = useState<FactoryRecommendation[]>([]);
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<SnapshotFreshness | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadOrders = useCallback(async () => {
    setOrders(await planningApi.listFactoryOrders(30));
  }, []);

  useEffect(() => {
    void planningApi
      .getFreshness()
      .then((f) => setFreshness(f.snapshot))
      .catch(() => undefined);
    void reloadOrders().catch((e) => reportError(e instanceof Error ? e.message : t.errors.factory));
  }, [reportError, reloadOrders, t.errors.factory]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.factoryHint}</p>
      <FreshnessBanner freshness={freshness} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await planningApi.getFactoryRecommendations();
                setRecs(res.recommendations);
                setDueAt(res.dueAt);
                setFreshness(res.freshness);
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.factory);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t.actions.loadFactoryRecs}
        </button>
        <button
          type="button"
          disabled={busy || recs.length === 0}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await planningApi.createFactoryOrder({
                  lines: recs.map((r) => ({
                    partProductId: r.partProductId,
                    qtyOrdered: r.suggestedQty,
                  })),
                });
                await reloadOrders();
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.factory);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t.actions.createFactoryOrder}
        </button>
      </div>
      {dueAt ? (
        <p className="text-sm text-zinc-600">
          {t.labels.dueAt}: {formatDateTime(dueAt)}
        </p>
      ) : null}
      <Panel title={t.actions.loadFactoryRecs}>
        <SimpleTable
          headers={[
            t.labels.sku,
            t.labels.grossRequirement,
            t.labels.available,
            t.labels.openPo,
            t.labels.safetyStock,
            t.labels.netRequirement,
          ]}
          rows={recs.map((r) => [
            `${r.sku} — ${r.name}`,
            String(r.grossRequirement),
            String(r.onHand),
            String(r.openPoQty),
            String(r.safetyStock),
            String(r.suggestedQty),
          ])}
          noDataLabel={t.states.noFactoryRecs}
        />
      </Panel>
      <Panel title={t.tabs.factory}>
        <SimpleTable
          headers={[
            t.labels.status,
            t.labels.dueAt,
            t.labels.lineCount,
            t.labels.qtyOrderedSum,
            t.labels.actions,
          ]}
          rows={orders.map((o) => [
            o.status,
            formatDateTime(o.dueAt),
            String(o.lines?.length ?? o._count?.lines ?? 0),
            String((o.lines ?? []).reduce((s, l) => s + l.qtyOrdered, 0)),
            <button
              key={o.id}
              type="button"
              className="text-cyan-700 underline"
              onClick={() =>
                void planningApi.exportFactoryOrder(o.id).catch((e) => reportError(String(e)))
              }
            >
              {t.actions.exportExcel}
            </button>,
          ])}
          noDataLabel={t.states.noFactoryOrders}
        />
      </Panel>
    </div>
  );
}

function QuotaBar({ used, quota }: { used: number; quota: number }) {
  const pct = quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-600">
        <span>
          {used} / {quota}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div
          className={pct >= 95 ? "h-full bg-rose-500" : pct >= 70 ? "h-full bg-amber-500" : "h-full bg-cyan-600"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MrpLinesTable({
  lines,
  onCreateBatch,
  creatingId,
  showMonth,
}: {
  lines: MrpRunLine[];
  onCreateBatch?: (line: MrpRunLine) => void;
  creatingId?: string | null;
  showMonth?: boolean;
}) {
  const t = strings.planning;
  const headers = [
    t.labels.sku,
    t.labels.name,
    t.labels.qty,
    t.labels.suggestedLaunch,
    ...(showMonth ? [t.labels.monthBucket] : []),
    t.labels.coverDays,
    t.labels.reason,
    ...(onCreateBatch ? [t.labels.actions] : []),
  ];
  return (
    <SimpleTable
      headers={headers}
      rows={lines.map((line) => [
        line.sku,
        line.name,
        String(line.qty),
        String(line.suggestedLaunchQty),
        ...(showMonth ? [line.monthBucket != null ? String(line.monthBucket) : "—"] : []),
        line.coverDays != null ? String(line.coverDays) : "—",
        line.reason ?? "—",
        ...(onCreateBatch
          ? [
              line.batchId ? (
                <span className="text-xs text-emerald-700">{t.labels.batchCreated}</span>
              ) : (
                <button
                  type="button"
                  disabled={creatingId === line.id || line.suggestedLaunchQty <= 0}
                  className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                  onClick={() => onCreateBatch(line)}
                >
                  {creatingId === line.id ? strings.common.loading : t.actions.createBatch}
                </button>
              ),
            ]
          : []),
      ])}
      noDataLabel={t.states.noData}
    />
  );
}

export function MrpDashboardPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [run, setRun] = useState<MrpRun | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRun(await planningApi.getLatestMrp());
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    } finally {
      setBusy(false);
    }
  }, [reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  // Prefer FULL run snapshot for the bar (same source as production-orders month0Qty).
  const quota = run?.monthlyPartsQuota ?? run?.runCapacity?.monthlyPartsQuota ?? 7000;
  const used = run?.summary?.quotaUsedMonth0 ?? 0;
  const liveQuota = run?.liveCapacity?.monthlyPartsQuota;

  return (
    <div className="space-y-4">
      {run?.salesFreshness ? <SalesFreshnessBanner freshness={run.salesFreshness} /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                setRun(await planningApi.runMrp("FULL"));
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.runMrp);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {t.actions.runMrp}
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
          onClick={() => void load()}
        >
          {t.actions.refresh}
        </button>
        {run?.computedAt ? (
          <span className="text-xs text-zinc-500">
            {t.labels.lastMrpRun}: {formatDateTime(run.computedAt)}
          </span>
        ) : null}
      </div>
      {run?.stale && liveQuota != null ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t.messages.mrpStaleConfig(liveQuota, quota)}
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title={t.labels.criticalSku} value={String(run?.summary?.criticalCount ?? 0)} />
        <StatCard title={t.labels.productionOrders} value={String(run?.summary?.productionCount ?? 0)} />
        <StatCard title={t.labels.packQueueMrp} value={String(run?.summary?.packCount ?? 0)} />
        <StatCard title={t.labels.semiReorder} value={String(run?.summary?.semiCount ?? 0)} />
      </div>
      <Panel title={t.labels.monthlyQuota}>
        <QuotaBar used={used} quota={quota} />
        {(run?.summary?.quotaOverflowCount ?? 0) > 0 ? (
          <p className="mt-2 text-sm text-amber-700">
            {t.messages.quotaOverflow(run?.summary?.quotaOverflowCount ?? 0)}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}

export function MrpProductionPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [month, setMonth] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof planningApi.getMrpProductionOrders>> | null>(
    null,
  );
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await planningApi.getMrpProductionOrders(month));
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    }
  }, [month, reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-zinc-700">
          {t.labels.monthBucket}
          <select
            className="ml-2 rounded-lg border border-zinc-200 px-3 py-1.5"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {[0, 1, 2, 3, 4, 5].map((m) => (
              <option key={m} value={m}>
                +{m}
              </option>
            ))}
          </select>
        </label>
        {data?.monthlyPartsQuota != null ? (
          <div className="min-w-[220px] flex-1">
            <QuotaBar used={data.quotaUsedMonth0 ?? 0} quota={data.monthlyPartsQuota} />
          </div>
        ) : null}
      </div>
      <Panel title={t.tabs.mrpProduction}>
        <MrpLinesTable
          lines={data?.lines ?? []}
          showMonth
          creatingId={creatingId}
          onCreateBatch={(line) => {
            void (async () => {
              setCreatingId(line.id);
              try {
                await planningApi.createBatchFromMrpLine(line.id);
                await load();
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.createBatch);
              } finally {
                setCreatingId(null);
              }
            })();
          }}
        />
      </Panel>
    </div>
  );
}

export function MrpPackagingPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [needPack, setNeedPack] = useState<MrpRunLine[]>([]);
  const [canPack, setCanPack] = useState<MrpRunLine[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await planningApi.getMrpPackaging();
        setNeedPack(res.needPack);
        setCanPack(res.canPack);
      } catch (e) {
        reportError(e instanceof Error ? e.message : t.errors.loadMrp);
      }
    })();
  }, [reportError, t.errors.loadMrp]);

  return (
    <div className="space-y-4">
      <Panel title={t.labels.needPack}>
        <MrpLinesTable lines={needPack} />
      </Panel>
      <Panel title={t.labels.canPack}>
        <MrpLinesTable lines={canPack} />
      </Panel>
    </div>
  );
}

export function MrpSemiFinishedPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [lines, setLines] = useState<MrpRunLine[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLines((await planningApi.getMrpSemiFinished()).lines);
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    }
  }, [reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel title={t.tabs.mrpSemi}>
      <MrpLinesTable
        lines={lines}
        creatingId={creatingId}
        onCreateBatch={(line) => {
          void (async () => {
            setCreatingId(line.id);
            try {
              await planningApi.createBatchFromMrpLine(line.id);
              await load();
            } catch (e) {
              reportError(e instanceof Error ? e.message : t.errors.createBatch);
            } finally {
              setCreatingId(null);
            }
          })();
        }}
      />
    </Panel>
  );
}

export function MrpCriticalPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [lines, setLines] = useState<MrpRunLine[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        setLines((await planningApi.getMrpCritical()).lines);
      } catch (e) {
        reportError(e instanceof Error ? e.message : t.errors.loadMrp);
      }
    })();
  }, [reportError, t.errors.loadMrp]);

  return (
    <Panel title={t.tabs.mrpCritical}>
      <MrpLinesTable lines={lines} />
    </Panel>
  );
}

export function MrpConfigPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [capacity, setCapacity] = useState<PlanningCapacityConfig | null>(null);
  const [horizon, setHorizon] = useState<PlanningHorizonConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRerun, setLastRerun] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [c, h] = await Promise.all([
          planningApi.getCapacityConfig(),
          planningApi.getHorizonConfig(),
        ]);
        setCapacity(c);
        setHorizon(h);
      } catch (e) {
        reportError(e instanceof Error ? e.message : t.errors.loadMrp);
      }
    })();
  }, [reportError, t.errors.loadMrp]);

  if (!capacity || !horizon) return <p className="text-sm text-zinc-500">{t.states.noData}</p>;

  return (
    <div className="space-y-4">
      {lastRerun ? (
        <p className="text-sm text-emerald-700">{t.messages.mrpReranAfterConfig(lastRerun)}</p>
      ) : null}
      <Panel title={t.labels.monthlyQuota}>
        <label className="text-sm text-zinc-700">
          {t.labels.monthlyPartsQuota}
          <input
            type="number"
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
            value={capacity.monthlyPartsQuota}
            onChange={(e) =>
              setCapacity({ monthlyPartsQuota: Number(e.target.value) })
            }
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await planningApi.updateCapacityConfig(capacity);
                setCapacity({ monthlyPartsQuota: res.monthlyPartsQuota });
                setLastRerun(res.mrpRunId ?? "ok");
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.saveSettings);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? strings.common.loading : t.actions.saveSettings}
        </button>
      </Panel>
      <Panel title={t.labels.mrpHorizon}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(
            [
              ["coverMonths", t.labels.coverMonths],
              ["velocityLookbackMonths", t.labels.velocityLookback],
              ["safetyMonths", t.labels.safetyMonths],
              ["warnCoverDays", t.labels.warnCoverDays],
              ["criticalCoverDays", t.labels.criticalCoverDays],
              ["defaultPackLeadDays", t.labels.defaultPackLeadDays],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-sm text-zinc-700">
              {label}
              <input
                type="number"
                step={key === "safetyMonths" ? "0.1" : "1"}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
                value={horizon[key]}
                onChange={(e) => setHorizon({ ...horizon, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
          <label className="text-sm text-zinc-700">
            {t.labels.softPipelineFactor}
            <input
              type="number"
              step="0.1"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={horizon.softPipelineFactor}
              onChange={(e) =>
                setHorizon({ ...horizon, softPipelineFactor: Number(e.target.value) })
              }
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await planningApi.updateHorizonConfig(horizon);
                setHorizon({
                  coverMonths: res.coverMonths,
                  velocityLookbackMonths: res.velocityLookbackMonths,
                  warnCoverDays: res.warnCoverDays,
                  criticalCoverDays: res.criticalCoverDays,
                  softPipelineFactor: res.softPipelineFactor,
                  defaultPackLeadDays: res.defaultPackLeadDays,
                });
                setLastRerun(res.mrpRunId ?? "ok");
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.saveSettings);
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? strings.common.loading : t.actions.saveSettings}
        </button>
      </Panel>
    </div>
  );
}

export function PlanningSettingsPanel({
  settings,
  onSaved,
  onError,
}: {
  settings: PlanningSettings | null;
  onSaved: (s: PlanningSettings) => void;
  onError: (msg: string) => void;
}) {
  const t = strings.planning;
  const [draft, setDraft] = useState<PlanningSettings | null>(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  if (!draft) return null;

  return (
    <Panel title={t.labels.planningSettings}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(
          [
            ["packCycleDays", t.labels.packCycleDays],
            ["packCapacityPerCycle", t.labels.packCapacity],
            ["factoryLeadTimeDays", t.labels.factoryLeadTime],
            ["safetyStockWeeks", t.labels.safetyStockWeeks],
            ["snapshotMaxAgeDays", t.labels.snapshotMaxAge],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-sm text-zinc-700">
            {label}
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
              value={draft[key]}
              onChange={(e) =>
                setDraft({ ...draft, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
        <label className="text-sm text-zinc-700 md:col-span-2">
          {t.labels.demandMix}
          <select
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
            value={draft.demandMix}
            onChange={(e) =>
              setDraft({
                ...draft,
                demandMix: e.target.value as PlanningSettings["demandMix"],
              })
            }
          >
            <option value="HARD_PLUS_FORECAST_BEYOND_COVERED">
              {t.labels.demandMixHardPlus}
            </option>
            <option value="MAX_FORECAST_HARD">{t.labels.demandMixMax}</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        onClick={() => {
          void (async () => {
            setBusy(true);
            try {
              onSaved(await planningApi.updateSettings(draft));
            } catch (e) {
              onError(e instanceof Error ? e.message : t.errors.saveSettings);
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {t.actions.saveSettings}
      </button>
    </Panel>
  );
}
