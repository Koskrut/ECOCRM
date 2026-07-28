"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type FactoryOrder,
  type FactoryRecommendation,
  type ForecastRow,
  type PackingList,
  type PlanningDashboard,
  type PlanningSettings,
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
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await planningApi.listForecast());
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.forecast);
    } finally {
      setBusy(false);
    }
  }, [reportError, t.errors.forecast]);

  useEffect(() => {
    void load();
  }, [load]);

  const byProduct = new Map<string, { sku: string; name: string; h14: number; h30: number; h90: number }>();
  for (const row of rows) {
    const cur = byProduct.get(row.productId) ?? {
      sku: row.sku,
      name: row.name,
      h14: 0,
      h30: 0,
      h90: 0,
    };
    if (row.horizonDays === 14) cur.h14 = row.qty;
    if (row.horizonDays === 30) cur.h30 = row.qty;
    if (row.horizonDays === 90) cur.h90 = row.qty;
    byProduct.set(row.productId, cur);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.forecastHint}</p>
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
                  const res = await planningApi.importSalesHistory(file);
                  setImportResult(t.messages.salesImportResult(res.importedRows, res.resolvedRows));
                  await planningApi.recomputeForecast();
                  await load();
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.forecast);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.importSalesHistory}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await planningApi.recomputeForecast();
                  await load();
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.forecast);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.recomputeForecast}
          </button>
        </div>
        {importResult ? <p className="mt-2 text-sm text-zinc-600">{importResult}</p> : null}
      </Panel>
      <Panel>
        <SimpleTable
          headers={[t.labels.sku, t.labels.name, t.labels.forecast14, t.labels.forecast30, t.labels.forecast90]}
          rows={[...byProduct.values()].map((r) => [
            r.sku,
            r.name,
            String(r.h14),
            String(r.h30),
            String(r.h90),
          ])}
          noDataLabel={t.states.noForecast}
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
      .then(setFreshness)
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
