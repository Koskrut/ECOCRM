"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { strings } from "@/locales";
import {
  planningApi,
  resolvePlanningUploadError,
  type FactoryLineTrackingStatus,
  type FactoryOrder,
  type FactoryRecommendation,
  type FactoryTrackingRow,
  type MrpForecastView,
  type MrpRun,
  type MrpRunLine,
  type ActionListItem,
  type PackingList,
  type PlanningCapacityConfig,
  type PlanningDashboard,
  type PlanningHorizonConfig,
  type PlanningSettings,
  type SalesFreshness,
  type SnapshotFreshness,
  type StockProjection,
} from "@/lib/api/resources/planning";
import { productsApi, type ProductCatalogItem } from "@/lib/api/resources/products";
import { formatDateTime } from "@/lib/crmDatetime";
import { isKitPartShort } from "@/lib/planning-kit-parts";
import { planningCycleStatusLabel, planningDocStatusLabel } from "@/lib/status-labels";

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formatSkuNameLabel(sku: string, name: string): string {
  return name && name !== sku ? `${sku} — ${name}` : sku;
}

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
  headers: React.ReactNode[];
  rows: Array<Array<React.ReactNode>>;
  noDataLabel: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {headers.map((header, headerIdx) => (
              <th key={headerIdx} className="px-3 py-2 text-left font-medium text-zinc-600">
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
  mrpStale,
  mrpStaleWarning,
}: {
  snapshot: SnapshotFreshness | null;
  sales: SalesFreshness | null;
  mrpStale?: boolean;
  mrpStaleWarning?: string | null;
}) {
  const t = strings.planning;
  return (
    <div className="space-y-2">
      <FreshnessBanner freshness={snapshot} />
      <SalesFreshnessBanner freshness={sales} />
      {mrpStale ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {mrpStaleWarning ?? t.messages.mrpStaleWarn}
        </div>
      ) : null}
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
          headers={[
            t.labels.sku,
            t.labels.name,
            t.labels.available,
            t.labels.daysOfCover,
            <>
              {t.labels.maxBuildNow}
              <span className="ml-1 text-xs font-normal text-zinc-500" title={t.labels.maxBuildNowHint}>
                ⓘ
              </span>
            </>,
          ]}
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
  const [salesUploadError, setSalesUploadError] = useState<string | null>(null);
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
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setSalesUploadError(null);
            }}
          />
          <button
            type="button"
            disabled={!file || busy}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => {
              if (!file) return;
              void (async () => {
                setBusy(true);
                setSalesUploadError(null);
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
                  setSalesUploadError(
                    resolvePlanningUploadError(e, {
                      fileTooLarge: t.errors.fileTooLarge,
                      fallback: t.errors.forecast,
                    }),
                  );
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
                    await planningApi.runMrp("FULL");
                    setUploadInfo(t.messages.salesPostedOk + " " + t.messages.mrpRecalculated);
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
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await planningApi.runMrp("FULL");
                  setUploadInfo(t.messages.mrpRecalculated);
                  await load();
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.loadMrp);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.recalculateMrp}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
            onClick={() => void load()}
          >
            {t.actions.refresh}
          </button>
        </div>
        {salesUploadError ? <p className="mt-2 text-sm text-red-600">{salesUploadError}</p> : null}
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
            t.labels.velocitySource,
          ]}
          rows={rows.map((r) => [
            r.sku,
            r.name,
            String(Math.round(r.avgMonthlySold)),
            String(r.forecastDemand),
            String(r.safetyStock),
            t.labels.velocitySourceValue(r.velocitySource),
          ])}
          noDataLabel={t.states.noPostedSales}
        />
      </Panel>
    </div>
  );
}

function formatPartQty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 100) / 100);
}

function KitPartsCell({
  line,
}: {
  line: NonNullable<PackingList["lines"]>[number];
}) {
  const t = strings.planning;
  if (line.kitProduct.kind === "PART") {
    return <p className="text-xs text-zinc-500">{t.labels.partLineHint}</p>;
  }
  const parts = line.parts ?? [];
  if (parts.length === 0) {
    return <p className="text-xs text-zinc-500">{t.labels.noKitParts}</p>;
  }
  const kitsForParts = Math.max(line.qtyApproved, line.targetPack ?? 0);
  return (
    <ul className="space-y-1 text-xs text-zinc-700">
      {parts.map((part) => {
        const need = part.qtyPerKit * kitsForParts;
        const short = isKitPartShort(part.available, need);
        const title = part.name && part.name !== part.sku ? part.name : part.sku;
        const skuHint = part.name && part.name !== part.sku ? ` (${part.sku})` : "";
        return (
          <li
            key={part.sku}
            className={short ? "text-rose-700" : ""}
            title={`${title}${skuHint}`}
          >
            <span className="font-medium">{title}</span>
            {" · "}
            {t.labels.partQtyPerKit(formatPartQty(part.qtyPerKit))}
            {kitsForParts > 0 ? (
              <>
                {" · "}
                {t.labels.partNeedForRequest(formatPartQty(need))}
              </>
            ) : null}
            {" · "}
            {t.labels.partOnStock(formatPartQty(part.available))}
            {part.isBottleneck ? ` · ${t.labels.bottleneck}` : null}
            {short ? ` · ${t.labels.missingPart}` : null}
          </li>
        );
      })}
    </ul>
  );
}

type PackWeekFilter = "all" | "can" | "blocked";

function WeekFillBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const bar =
    pct >= 90 ? "h-full bg-emerald-500" : pct >= 50 ? "h-full bg-cyan-600" : "h-full bg-amber-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-600">
        <span>
          {used} / {limit}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={bar} style={{ width: `${pct}%` }} />
      </div>
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
  const [cycleEndEdit, setCycleEndEdit] = useState("");
  const [filter, setFilter] = useState<PackWeekFilter>("all");

  const applyActive = useCallback((full: PackingList) => {
    setActive(full);
    setCycleEndEdit(toDateInputValue(full.cycleEnd));
    setQtys(
      Object.fromEntries((full.lines ?? []).map((l) => [l.kitProductId, String(l.qtyApproved)])),
    );
  }, []);

  const reloadLists = useCallback(async () => {
    const next = await planningApi.listPackingLists(30);
    setLists(next);
    return next;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const next = await reloadLists();
        if (next[0]) applyActive(await planningApi.getPackingList(next[0].id));
      } catch (e) {
        reportError(e instanceof Error ? e.message : t.errors.packing);
      }
    })();
  }, [applyActive, reloadLists, reportError, t.errors.packing]);

  const lines = active?.lines ?? [];
  const weekNeed = lines.reduce((s, l) => s + (l.targetPack ?? 0), 0);
  const weekCan = lines.reduce((s, l) => s + Math.max(0, l.maxFromParts), 0);
  const weekRequest = active?.capacityUsed ?? 0;
  const weekLimit = active?.capacityLimit ?? 2000;
  const blockedCount = lines.filter((l) => (l.targetPack ?? 0) > 0 && l.maxFromParts <= 0).length;

  const filtered = useMemo(() => {
    if (filter === "can") return lines.filter((l) => l.maxFromParts > 0);
    if (filter === "blocked") {
      return lines.filter((l) => (l.targetPack ?? 0) > 0 && l.maxFromParts <= 0);
    }
    return lines;
  }, [lines, filter]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.packingHint}</p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard title={t.labels.weekNeed} value={String(weekNeed)} />
        <StatCard title={t.labels.weekCan} value={String(weekCan)} />
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-zinc-500">{t.labels.weekRequest}</p>
          <p className="mt-2 text-sm font-medium text-zinc-900">
            {weekRequest} / {weekLimit}
          </p>
          <div className="mt-3">
            <WeekFillBar used={weekRequest} limit={weekLimit} />
          </div>
        </div>
      </div>

      {active && weekRequest < weekLimit ? (
        <p className="text-sm text-amber-800">
          {t.messages.weekShortfall(weekRequest, weekLimit, blockedCount)}
        </p>
      ) : null}

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
                    const nextLines = Object.entries(qtys).map(([kitProductId, qty]) => ({
                      kitProductId,
                      qtyApproved: Number(qty) || 0,
                    }));
                    const updated = await planningApi.updatePackingLines(active.id, nextLines);
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
              disabled={busy || weekRequest <= 0}
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

      {!active ? (
        <Panel>
          <p className="text-sm text-zinc-600">{t.messages.packingEmpty}</p>
        </Panel>
      ) : (
        <Panel
          title={`${planningCycleStatusLabel(active.status)} · ${formatDateTime(active.cycleStart)}`}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {(["all", "can", "blocked"] as PackWeekFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={
                  filter === f
                    ? "rounded-full bg-cyan-600 px-4 py-1.5 text-sm text-white"
                    : "rounded-full border border-zinc-200 px-4 py-1.5 text-sm text-zinc-700"
                }
              >
                {f === "all" ? t.filters.all : f === "can" ? t.filters.canNow : t.filters.blocked}
              </button>
            ))}
          </div>
          {active.status !== "DONE" ? (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <span>{t.labels.cycleEnd}</span>
                <input
                  type="date"
                  className="rounded border border-zinc-200 px-2 py-1"
                  value={cycleEndEdit}
                  onChange={(e) => setCycleEndEdit(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !cycleEndEdit}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                onClick={() => {
                  void (async () => {
                    setBusy(true);
                    try {
                      applyActive(await planningApi.updatePackingDueAt(active.id, cycleEndEdit));
                      await reloadLists();
                    } catch (e) {
                      reportError(e instanceof Error ? e.message : t.errors.packing);
                    } finally {
                      setBusy(false);
                    }
                  })();
                }}
              >
                {t.actions.saveDueAt}
              </button>
              <p className="text-xs text-zinc-500">{t.labels.packingDueHint}</p>
            </div>
          ) : null}
          <SimpleTable
            headers={[
              t.labels.kit,
              t.labels.kitParts,
              t.labels.packNeed,
              t.labels.canAssemble,
              t.labels.weekRequest,
              t.labels.whyInRequest,
            ]}
            rows={filtered.map((line) => {
              const need = line.targetPack ?? 0;
              const blocked = need > 0 && line.maxFromParts <= 0;
              return [
                <span key={line.id}>
                  <span className={`block font-medium ${blocked ? "text-rose-700" : ""}`}>
                    {line.kitProduct.name}
                  </span>
                  <span className="block text-xs text-zinc-500">{line.kitProduct.sku}</span>
                  {line.priority === 0 ? (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
                      {t.labels.ordersPriority}
                    </span>
                  ) : null}
                </span>,
                <KitPartsCell key={`${line.id}-parts`} line={line} />,
                String(need),
                String(line.maxFromParts),
                active.status === "DRAFT" && line.maxFromParts > 0 ? (
                  <input
                    key={`${line.id}-qty`}
                    className="w-24 rounded border border-zinc-200 px-2 py-1"
                    value={qtys[line.kitProductId] ?? String(line.qtyApproved)}
                    onChange={(e) =>
                      setQtys((prev) => ({ ...prev, [line.kitProductId]: e.target.value }))
                    }
                  />
                ) : (
                  String(line.qtyApproved)
                ),
                line.priority === 0 ? t.labels.ordersPriority : t.labels.stockPriority,
              ];
            })}
            noDataLabel={t.states.noData}
          />
        </Panel>
      )}

      <Panel title={t.labels.previousPackWeeks}>
        <SimpleTable
          headers={[
            t.labels.status,
            t.labels.cycleEnd,
            t.labels.capacityUsed,
            t.labels.createdAt,
            t.labels.actions,
          ]}
          rows={lists.map((list) => [
            planningDocStatusLabel(list.status),
            formatDateTime(list.cycleEnd),
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
    </div>
  );
}

function isFactoryDueOverdue(dueAt: string): boolean {
  return dueAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function trackingLabel(status: FactoryLineTrackingStatus | undefined): string {
  const t = strings.planning.labels;
  if (status === "received") return t.trackingReceived;
  if (status === "due_soon") return t.trackingDueSoon;
  if (status === "overdue") return t.trackingOverdue;
  return t.trackingOnTrack;
}

function TrackingBadge({ status }: { status: FactoryLineTrackingStatus | undefined }) {
  const label = trackingLabel(status);
  const cls =
    status === "overdue"
      ? "bg-rose-100 text-rose-800"
      : status === "due_soon"
        ? "bg-amber-100 text-amber-900"
        : status === "received"
          ? "bg-emerald-100 text-emerald-800"
          : "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

export function FactoryPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [recs, setRecs] = useState<FactoryRecommendation[]>([]);
  const [recQtys, setRecQtys] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<FactoryOrder[]>([]);
  const [active, setActive] = useState<FactoryOrder | null>(null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [createDueAt, setCreateDueAt] = useState("");
  const [activeDueEdit, setActiveDueEdit] = useState("");
  const [lineQtys, setLineQtys] = useState<Record<string, string>>({});
  const [lineDues, setLineDues] = useState<Record<string, string>>({});
  const [lineReceived, setLineReceived] = useState<Record<string, string>>({});
  const [externalCodeEdit, setExternalCodeEdit] = useState("");
  const [freshness, setFreshness] = useState<SnapshotFreshness | null>(null);
  const [busy, setBusy] = useState(false);
  const [partSearch, setPartSearch] = useState("");
  const [partHits, setPartHits] = useState<ProductCatalogItem[]>([]);
  const [addQty, setAddQty] = useState("1");
  const [addDue, setAddDue] = useState("");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [trackingRows, setTrackingRows] = useState<FactoryTrackingRow[]>([]);

  const applyActive = useCallback((order: FactoryOrder) => {
    setActive(order);
    setActiveDueEdit(toDateInputValue(order.dueAt));
    setExternalCodeEdit(order.externalCode ?? "");
    setLineQtys(
      Object.fromEntries((order.lines ?? []).map((l) => [l.partProductId, String(l.qtyOrdered)])),
    );
    setLineDues(
      Object.fromEntries(
        (order.lines ?? []).map((l) => [
          l.id,
          toDateInputValue(l.dueAt ?? l.effectiveDueAt ?? order.dueAt),
        ]),
      ),
    );
    setLineReceived(
      Object.fromEntries((order.lines ?? []).map((l) => [l.partProductId, String(l.qtyReceived)])),
    );
    setAddDue(toDateInputValue(order.dueAt));
  }, []);

  const reloadOrders = useCallback(async () => {
    setOrders(await planningApi.listFactoryOrders(30));
  }, []);

  const reloadTracking = useCallback(async () => {
    try {
      const res = await planningApi.getFactoryTracking(false);
      setTrackingRows(res.rows);
    } catch {
      /* optional panel */
    }
  }, []);

  useEffect(() => {
    void planningApi
      .getFreshness()
      .then((f) => setFreshness(f.snapshot))
      .catch(() => undefined);
    void reloadOrders().catch((e) => reportError(e instanceof Error ? e.message : t.errors.factory));
    void reloadTracking();
  }, [reportError, reloadOrders, reloadTracking, t.errors.factory]);

  useEffect(() => {
    if (partSearch.trim().length < 2) {
      setPartHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void productsApi
        .listParts({ search: partSearch.trim(), pageSize: 12 })
        .then((res) => setPartHits(res.items ?? []))
        .catch(() => setPartHits([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [partSearch]);

  const runBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.factory);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" id="factory-tracking">
      <p className="text-sm text-zinc-600">{t.messages.factoryHint}</p>
      <FreshnessBanner freshness={freshness} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
          onClick={() =>
            void runBusy(async () => {
              const res = await planningApi.getFactoryRecommendations();
              setRecs(res.recommendations);
              setRecQtys(
                Object.fromEntries(res.recommendations.map((r) => [r.partProductId, String(r.suggestedQty)])),
              );
              setDueAt(res.dueAt);
              setCreateDueAt(toDateInputValue(res.dueAt));
              setFreshness(res.freshness);
            })
          }
        >
          {t.actions.loadFactoryRecs}
        </button>
        <button
          type="button"
          disabled={busy || recs.length === 0}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() =>
            void runBusy(async () => {
              const created = await planningApi.createFactoryOrder({
                lines: recs.map((r) => ({
                  partProductId: r.partProductId,
                  qtyOrdered: Number(recQtys[r.partProductId]) || r.suggestedQty,
                })),
                dueAt: createDueAt || undefined,
              });
              applyActive(created);
              await reloadOrders();
              await reloadTracking();
            })
          }
        >
          {t.actions.createFactoryOrder}
        </button>
        {recs.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <span>{t.labels.dueAt}</span>
            <input
              type="date"
              className="rounded border border-zinc-200 px-2 py-1"
              value={createDueAt}
              onChange={(e) => setCreateDueAt(e.target.value)}
            />
          </label>
        ) : null}
      </div>
      {dueAt ? (
        <p className="text-sm text-zinc-600">
          {t.labels.factoryDueHint}: {formatDateTime(dueAt)}
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
            t.labels.qtyOrderedSum,
            t.labels.actions,
          ]}
          rows={recs.map((r) => [
            formatSkuNameLabel(r.sku, r.name),
            String(r.grossRequirement),
            String(r.onHand),
            String(r.openPoQty),
            String(r.safetyStock),
            String(r.netRequirement),
            <input
              key={r.partProductId}
              className="w-24 rounded border border-zinc-200 px-2 py-1"
              value={recQtys[r.partProductId] ?? String(r.suggestedQty)}
              onChange={(e) =>
                setRecQtys((prev) => ({ ...prev, [r.partProductId]: e.target.value }))
              }
            />,
            active?.status === "DRAFT" ? (
              <button
                key={`add-${r.partProductId}`}
                type="button"
                disabled={busy}
                className="text-xs text-cyan-700 underline disabled:opacity-40"
                onClick={() =>
                  void runBusy(async () => {
                    applyActive(
                      await planningApi.addFactoryLine(active.id, {
                        partProductId: r.partProductId,
                        qtyOrdered: Number(recQtys[r.partProductId]) || r.suggestedQty,
                        dueAt: activeDueEdit || undefined,
                      }),
                    );
                    await reloadOrders();
                  })
                }
              >
                {t.actions.addToDraft}
              </button>
            ) : (
              "—"
            ),
          ])}
          noDataLabel={t.states.noFactoryRecs}
        />
      </Panel>

      {(trackingRows.length > 0 || (orders.some((o) => (o.overdueLineCount ?? 0) > 0))) ? (
        <Panel title={t.labels.factoryTracking}>
          <SimpleTable
            headers={[
              t.labels.sku,
              t.labels.externalCode,
              t.labels.qty,
              t.labels.qtyReceived,
              t.labels.lineDueAt,
              t.labels.lineTrackingStatus,
              t.labels.actions,
            ]}
            rows={trackingRows.map((row) => [
              formatSkuNameLabel(row.sku, row.name),
              row.externalCode ?? "—",
              String(row.qtyOrdered),
              String(row.qtyReceived),
              <span
                key={`tdue-${row.lineId}`}
                className={row.trackingStatus === "overdue" ? "font-medium text-rose-700" : undefined}
              >
                {formatDateTime(row.dueAt)}
              </span>,
              <TrackingBadge key={`tb-${row.lineId}`} status={row.trackingStatus} />,
              <button
                key={`to-${row.lineId}`}
                type="button"
                className="text-cyan-700 underline"
                onClick={() =>
                  void runBusy(async () => {
                    applyActive(await planningApi.getFactoryOrder(row.orderId));
                  })
                }
              >
                {t.actions.open}
              </button>,
            ])}
            noDataLabel={t.states.noData}
          />
        </Panel>
      ) : null}

      <Panel title={t.tabs.factory}>
        <SimpleTable
          headers={[
            t.labels.status,
            t.labels.externalCode,
            t.labels.dueAt,
            t.labels.nearestLineDue,
            t.labels.overdueLinesCount,
            t.labels.lineCount,
            t.labels.qtyOrderedSum,
            t.labels.actions,
          ]}
          rows={orders.map((o) => [
            planningDocStatusLabel(o.status),
            o.externalCode ?? "—",
            <span
              key={`due-${o.id}`}
              className={isFactoryDueOverdue(o.dueAt) ? "font-medium text-rose-700" : undefined}
            >
              {formatDateTime(o.dueAt)}
              {isFactoryDueOverdue(o.dueAt) ? ` (${t.labels.dueOverdue})` : ""}
            </span>,
            o.nearestLineDueYmd ?? "—",
            (o.overdueLineCount ?? 0) > 0 ? (
              <span key={`ov-${o.id}`} className="font-medium text-rose-700">
                {o.overdueLineCount}
              </span>
            ) : (
              "0"
            ),
            String(o.lines?.length ?? o._count?.lines ?? 0),
            String((o.lines ?? []).reduce((s, l) => s + l.qtyOrdered, 0)),
            <span key={o.id} className="flex flex-wrap gap-2">
              <button
                type="button"
                className="text-cyan-700 underline"
                onClick={() =>
                  void runBusy(async () => {
                    applyActive(await planningApi.getFactoryOrder(o.id));
                  })
                }
              >
                {t.actions.open}
              </button>
              <button
                type="button"
                className="text-cyan-700 underline"
                onClick={() =>
                  void planningApi.exportFactoryOrder(o.id).catch((e) => reportError(String(e)))
                }
              >
                {t.actions.exportExcel}
              </button>
            </span>,
          ])}
          noDataLabel={t.states.noFactoryOrders}
        />
      </Panel>

      {active ? (
        <Panel title={`${planningDocStatusLabel(active.status)} · ${formatDateTime(active.orderedAt)}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {active.status !== "CLOSED" && active.status !== "CANCELLED" ? (
              <>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <span>{t.labels.dueAt}</span>
                  <input
                    type="date"
                    className="rounded border border-zinc-200 px-2 py-1"
                    value={activeDueEdit}
                    onChange={(e) => setActiveDueEdit(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !activeDueEdit}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(await planningApi.updateFactoryDueAt(active.id, activeDueEdit));
                      await reloadOrders();
                    })
                  }
                >
                  {t.actions.saveDueAt}
                </button>
              </>
            ) : null}
            {active.status === "DRAFT" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      const lines = (active.lines ?? []).map((l) => ({
                        partProductId: l.partProductId,
                        qtyOrdered: Number(lineQtys[l.partProductId]) || l.qtyOrdered,
                        dueAt: lineDues[l.id] || null,
                      }));
                      applyActive(await planningApi.updateFactoryLines(active.id, lines));
                      await reloadOrders();
                    })
                  }
                >
                  {t.actions.saveFactoryLines}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(await planningApi.approveFactoryOrder(active.id));
                      await reloadOrders();
                      await reloadTracking();
                    })
                  }
                >
                  {t.actions.approveFactory}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-sm text-rose-700 disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(await planningApi.updateFactoryStatus(active.id, "CANCELLED"));
                      await reloadOrders();
                    })
                  }
                >
                  {t.actions.cancelFactoryDraft}
                </button>
              </>
            ) : null}
            {active.status === "OPEN" || active.status === "PARTIAL" || active.status === "CLOSED" ? (
              <>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <span>{t.labels.externalCode}</span>
                  <input
                    className="rounded border border-zinc-200 px-2 py-1"
                    value={externalCodeEdit}
                    onChange={(e) => setExternalCodeEdit(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(
                        await planningApi.updateFactoryExternalCode(active.id, externalCodeEdit),
                      );
                      await reloadOrders();
                    })
                  }
                >
                  {t.actions.saveExternalCode}
                </button>
              </>
            ) : null}
            {active.status === "OPEN" || active.status === "PARTIAL" ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(
                        await planningApi.updateFactoryReceived(
                          active.id,
                          (active.lines ?? []).map((l) => ({
                            partProductId: l.partProductId,
                            qtyReceived: Number(lineReceived[l.partProductId]) || 0,
                          })),
                        ),
                      );
                      await reloadOrders();
                      await reloadTracking();
                    })
                  }
                >
                  {t.actions.saveFactoryReceived}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-sm disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      applyActive(
                        await planningApi.updateFactoryReceived(
                          active.id,
                          (active.lines ?? []).map((l) => ({
                            partProductId: l.partProductId,
                            qtyReceived: l.qtyOrdered,
                          })),
                        ),
                      );
                      await reloadOrders();
                      await reloadTracking();
                    })
                  }
                >
                  {t.actions.markFactoryReceived}
                </button>
              </>
            ) : null}
            <p className="text-xs text-zinc-500">{t.labels.factoryDueHint}</p>
          </div>

          {active.status === "DRAFT" ? (
            <div className="mb-4 rounded-xl border border-zinc-100 bg-zinc-50 p-3">
              <p className="mb-2 text-sm font-medium text-zinc-800">{t.actions.addFactoryLine}</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-xs text-zinc-600">
                  {t.labels.searchPart}
                  <input
                    className="rounded border border-zinc-200 px-2 py-1 text-sm"
                    value={partSearch}
                    onChange={(e) => {
                      setPartSearch(e.target.value);
                      setSelectedPartId(null);
                    }}
                    placeholder={t.labels.searchPart}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  {t.labels.addPartQty}
                  <input
                    className="w-24 rounded border border-zinc-200 px-2 py-1 text-sm"
                    value={addQty}
                    onChange={(e) => setAddQty(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-zinc-600">
                  {t.labels.lineDueAt}
                  <input
                    type="date"
                    className="rounded border border-zinc-200 px-2 py-1 text-sm"
                    value={addDue}
                    onChange={(e) => setAddDue(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !selectedPartId}
                  className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  onClick={() =>
                    void runBusy(async () => {
                      if (!selectedPartId) return;
                      applyActive(
                        await planningApi.addFactoryLine(active.id, {
                          partProductId: selectedPartId,
                          qtyOrdered: Number(addQty) || 1,
                          dueAt: addDue || undefined,
                        }),
                      );
                      setPartSearch("");
                      setSelectedPartId(null);
                      setPartHits([]);
                      setAddQty("1");
                      await reloadOrders();
                    })
                  }
                >
                  {t.actions.addFactoryLine}
                </button>
              </div>
              {partHits.length > 0 ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-zinc-200 bg-white text-sm">
                  {partHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`block w-full px-3 py-1.5 text-left hover:bg-cyan-50 ${
                          selectedPartId === p.id ? "bg-cyan-50 font-medium" : ""
                        }`}
                        onClick={() => {
                          setSelectedPartId(p.id);
                          setPartSearch(formatSkuNameLabel(p.sku, p.name));
                          setPartHits([]);
                        }}
                      >
                        {formatSkuNameLabel(p.sku, p.name)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <SimpleTable
            headers={
              active.status === "DRAFT"
                ? [t.labels.sku, t.labels.qty, t.labels.lineDueAt, t.labels.actions]
                : [
                    t.labels.sku,
                    t.labels.qty,
                    t.labels.qtyReceived,
                    t.labels.lineDueAt,
                    t.labels.lineTrackingStatus,
                  ]
            }
            rows={(active.lines ?? []).map((line) => {
              const overdue = line.trackingStatus === "overdue";
              if (active.status === "DRAFT") {
                return [
                  formatSkuNameLabel(line.partProduct.sku, line.partProduct.name),
                  <input
                    key={`${line.id}-qty`}
                    className="w-24 rounded border border-zinc-200 px-2 py-1"
                    value={lineQtys[line.partProductId] ?? String(line.qtyOrdered)}
                    onChange={(e) =>
                      setLineQtys((prev) => ({ ...prev, [line.partProductId]: e.target.value }))
                    }
                  />,
                  <input
                    key={`${line.id}-due`}
                    type="date"
                    className="rounded border border-zinc-200 px-2 py-1"
                    value={lineDues[line.id] ?? ""}
                    onChange={(e) => setLineDues((prev) => ({ ...prev, [line.id]: e.target.value }))}
                  />,
                  <button
                    key={`${line.id}-rm`}
                    type="button"
                    disabled={busy || (active.lines?.length ?? 0) <= 1}
                    className="text-xs text-rose-700 underline disabled:opacity-40"
                    onClick={() =>
                      void runBusy(async () => {
                        applyActive(await planningApi.deleteFactoryLine(active.id, line.id));
                        await reloadOrders();
                      })
                    }
                  >
                    {t.actions.removeFactoryLine}
                  </button>,
                ];
              }
              return [
                <span key={`${line.id}-sku`} className={overdue ? "text-rose-700" : undefined}>
                  {formatSkuNameLabel(line.partProduct.sku, line.partProduct.name)}
                </span>,
                String(line.qtyOrdered),
                active.status === "OPEN" || active.status === "PARTIAL" ? (
                  <input
                    key={`${line.id}-recv`}
                    className="w-24 rounded border border-zinc-200 px-2 py-1"
                    value={lineReceived[line.partProductId] ?? String(line.qtyReceived)}
                    onChange={(e) =>
                      setLineReceived((prev) => ({
                        ...prev,
                        [line.partProductId]: e.target.value,
                      }))
                    }
                  />
                ) : (
                  String(line.qtyReceived)
                ),
                active.status === "OPEN" || active.status === "PARTIAL" ? (
                  <input
                    key={`${line.id}-ldue`}
                    type="date"
                    className={`rounded border border-zinc-200 px-2 py-1 ${overdue ? "border-rose-300" : ""}`}
                    value={lineDues[line.id] ?? ""}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLineDues((prev) => ({ ...prev, [line.id]: next }));
                      void runBusy(async () => {
                        applyActive(
                          await planningApi.updateFactoryLineDueAt(active.id, line.id, next),
                        );
                        await reloadOrders();
                        await reloadTracking();
                      });
                    }}
                  />
                ) : (
                  formatDateTime(line.effectiveDueAt ?? line.dueAt ?? active.dueAt)
                ),
                <TrackingBadge key={`${line.id}-st`} status={line.trackingStatus} />,
              ];
            })}
            noDataLabel={t.states.noData}
          />
        </Panel>
      ) : null}
    </div>
  );
}

export function QuotaBar({ used, quota }: { used: number; quota: number }) {
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

function exportActionListCsv(items: ActionListItem[], filename: string) {
  const header = "sku,qty,desiredDate,reason,priority\n";
  const body = items
    .map(
      (i) =>
        `${i.sku},${i.qty},${i.desiredDate},"${(i.reason ?? "").replace(/"/g, '""')}",${i.priority}`,
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PackagingActionListTable({
  items,
  lineById,
  creatingId,
  onCreateBatch,
  onProposePacking,
  proposingId,
}: {
  items: ActionListItem[];
  lineById?: Map<string, MrpRunLine>;
  creatingId?: string | null;
  onCreateBatch?: (line: MrpRunLine) => void;
  onProposePacking?: () => void;
  proposingId?: string | null;
}) {
  const t = strings.planning;
  const headers = [
    t.labels.sku,
    t.labels.name,
    t.labels.packNeed,
    t.labels.maxFromParts,
    t.labels.packQty,
    t.labels.desiredDate,
    t.labels.bottleneck,
    t.labels.reason,
    t.labels.actions,
  ];
  return (
    <SimpleTable
      headers={headers}
      rows={items.map((item) => {
        const line = lineById?.get(item.lineId);
        return [
          item.sku,
          item.name,
          item.packNeed != null ? String(item.packNeed) : "—",
          item.maxFromParts != null ? String(item.maxFromParts) : "0",
          String(item.qty),
          item.desiredDate,
          item.bottleneckSku ?? "—",
          <>
            {item.reason || "—"}
            {item.blockers?.length ? (
              <span className="ml-1 text-xs text-amber-700">{item.blockers.join(", ")}</span>
            ) : null}
          </>,
          <>
            {item.canCreateBatch && line && onCreateBatch ? (
              <button
                type="button"
                disabled={creatingId === item.lineId}
                className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                onClick={() => onCreateBatch(line)}
              >
                {creatingId === item.lineId ? strings.common.loading : t.actions.createBatch}
              </button>
            ) : null}
            {item.lineType === "CAN_PACK" && onProposePacking ? (
              <button
                type="button"
                disabled={proposingId === item.lineId}
                className="ml-1 rounded-md border border-cyan-600 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-40"
                onClick={() => onProposePacking()}
              >
                {t.actions.proposePacking}
              </button>
            ) : null}
          </>,
        ];
      })}
      noDataLabel={t.states.noData}
    />
  );
}

function ActionListTable({
  items,
  lineById,
  creatingId,
  onCreateBatch,
  onProposePacking,
  proposingId,
}: {
  items: ActionListItem[];
  lineById?: Map<string, MrpRunLine>;
  creatingId?: string | null;
  onCreateBatch?: (line: MrpRunLine) => void;
  onProposePacking?: () => void;
  proposingId?: string | null;
}) {
  const t = strings.planning;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const headers = [
    t.labels.sku,
    t.labels.qty,
    t.labels.desiredDate,
    t.labels.priority,
    t.labels.reason,
    t.labels.actions,
  ];
  return (
    <SimpleTable
      headers={headers}
      rows={items.map((item) => {
        const line = lineById?.get(item.lineId);
        const breakdown = line?.details?.breakdown as Record<string, unknown> | undefined;
        return [
          item.sku,
          String(item.qty),
          item.desiredDate,
          item.priority,
          <>
            {item.reason || "—"}
            {breakdown ? (
              <button
                type="button"
                className="ml-2 text-xs text-cyan-700 underline"
                onClick={() =>
                  setExpandedId(expandedId === item.lineId ? null : item.lineId)
                }
              >
                {expandedId === item.lineId ? t.actions.hideBreakdown : t.actions.showBreakdown}
              </button>
            ) : null}
            {expandedId === item.lineId && breakdown ? (
              <pre className="mt-1 max-w-md whitespace-pre-wrap text-xs text-zinc-600">
                {JSON.stringify(breakdown, null, 2)}
              </pre>
            ) : null}
          </>,
          <>
            {item.canCreateBatch && line && onCreateBatch ? (
              <button
                type="button"
                disabled={creatingId === item.lineId}
                className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                onClick={() => onCreateBatch(line)}
              >
                {creatingId === item.lineId ? strings.common.loading : t.actions.createBatch}
              </button>
            ) : null}
            {item.lineType === "CAN_PACK" && onProposePacking ? (
              <button
                type="button"
                disabled={proposingId === item.lineId}
                className="ml-1 rounded-md border border-cyan-600 px-2 py-1 text-xs font-medium text-cyan-700 disabled:opacity-40"
                onClick={() => onProposePacking()}
              >
                {t.actions.proposePacking}
              </button>
            ) : null}
            {item.blockers?.length ? (
              <span className="ml-1 text-xs text-amber-700">{item.blockers.join(", ")}</span>
            ) : null}
          </>,
        ];
      })}
      noDataLabel={t.states.noData}
    />
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
        <StatCard title={t.labels.canPackCount} value={String(run?.summary?.canPackCount ?? 0)} />
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

  const lineById = new Map((data?.lines ?? []).map((l) => [l.id, l]));
  const items = data?.items ?? [];

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
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700"
          onClick={() => exportActionListCsv(items, `production-m${month}.csv`)}
        >
          {t.actions.exportCsv}
        </button>
      </div>
      <Panel title={t.tabs.mrpProduction}>
        <ActionListTable
          items={items}
          lineById={lineById}
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
  const [needItems, setNeedItems] = useState<ActionListItem[]>([]);
  const [canItems, setCanItems] = useState<ActionListItem[]>([]);
  const [blockedItems, setBlockedItems] = useState<ActionListItem[]>([]);
  const [needPack, setNeedPack] = useState<MrpRunLine[]>([]);
  const [canPack, setCanPack] = useState<MrpRunLine[]>([]);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await planningApi.getMrpPackaging();
      setNeedPack(res.needPack);
      setCanPack(res.canPack);
      setNeedItems(res.needItems ?? res.items.filter((i) => i.lineType === "PACK"));
      setCanItems(res.canItems ?? res.items.filter((i) => i.lineType === "CAN_PACK"));
      setBlockedItems(res.blockedItems ?? []);
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    }
  }, [reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  const lineById = new Map([...needPack, ...canPack].map((l) => [l.id, l]));

  const exportItems = [...needItems, ...canItems, ...blockedItems];

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.packListHint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700"
          onClick={() => exportActionListCsv(exportItems, "packing.csv")}
        >
          {t.actions.exportCsv}
        </button>
      </div>
      <Panel title={t.labels.needPack}>
        <PackagingActionListTable items={needItems} lineById={lineById} />
      </Panel>
      <Panel title={t.labels.canPack}>
        <PackagingActionListTable
          items={canItems}
          lineById={lineById}
          creatingId={creatingId}
          proposingId={proposing ? "all" : null}
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
          onProposePacking={() => {
            void (async () => {
              setProposing(true);
              try {
                await planningApi.proposePackingList();
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.packing);
              } finally {
                setProposing(false);
              }
            })();
          }}
        />
      </Panel>
      {blockedItems.length > 0 ? (
        <Panel title={t.labels.blockedPack}>
          <PackagingActionListTable items={blockedItems} lineById={lineById} />
        </Panel>
      ) : null}
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
                  safetyMonths: res.safetyMonths,
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
      <p className="mb-3 text-sm text-zinc-600">{t.messages.packSettingsHint}</p>
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
