"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { strings } from "@/locales";
import {
  planningApi,
  type ActionListItem,
  type FactoryRecommendation,
  type MrpRunLine,
  type PlanningDueReminder,
  type PlanningTodayView,
  type TodayAwaitingStockGroup,
  type TodayBurningItem,
  type TodaySuggestedAction,
} from "@/lib/api/resources/planning";
import { formatDateTime } from "@/lib/crmDatetime";
import { StockReadinessBadge } from "@/components/orders/StockReadinessBadge";
import { QuotaBar } from "./PlanningOpsPanels";

function useStableErrorHandler(onError: (msg: string) => void) {
  const ref = { current: onError };
  ref.current = onError;
  return useCallback((msg: string) => ref.current(msg), []);
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      {title ? <h2 className="mb-3 text-sm font-semibold text-zinc-900">{title}</h2> : null}
      {children}
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  href,
}: {
  title: string;
  value: string;
  subtitle?: string;
  href?: string;
}) {
  const inner = (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-cyan-300">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}

function SimpleTable({
  headers,
  rows,
  noDataLabel,
  highlightSku,
}: {
  headers: React.ReactNode[];
  rows: Array<Array<React.ReactNode>>;
  noDataLabel: string;
  highlightSku?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {headers.map((header, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium text-zinc-600">
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
            rows.map((row, rowIdx) => {
              const skuCell = row[0];
              const isHighlight =
                highlightSku &&
                typeof skuCell === "string" &&
                skuCell.toLowerCase().includes(highlightSku.toLowerCase());
              return (
                <tr key={rowIdx} className={isHighlight ? "bg-cyan-50/60" : undefined}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 align-top text-zinc-900">
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function actionLabel(action: TodaySuggestedAction): string {
  const t = strings.planning.actions;
  if (action === "pack") return t.goPack;
  if (action === "factory") return t.goFactory;
  return t.goProduction;
}

function actionHref(action: TodaySuggestedAction, sku: string): string {
  const q = encodeURIComponent(sku);
  if (action === "pack") return `/planning?tab=pack&sku=${q}`;
  return `/planning?tab=make&sku=${q}`;
}

function formatQty(value: number | null | undefined): string {
  return value == null ? "—" : String(value);
}

function AwaitingStockTable({
  groups,
  expandedKey,
  onToggle,
}: {
  groups: TodayAwaitingStockGroup[];
  expandedKey: string | null;
  onToggle: (key: string) => void;
}) {
  const t = strings.planning;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">
        <thead>
          <tr className="bg-zinc-50">
            {[
              t.labels.sku,
              t.labels.name,
              t.labels.packNeed,
              t.labels.onStock,
              t.labels.partsGap,
              t.labels.ordersCount,
              t.labels.actions,
            ].map((header) => (
              <th key={header} className="px-3 py-2 text-left font-medium text-zinc-600">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {groups.length === 0 ? (
            <tr>
              <td className="px-3 py-6 text-zinc-500" colSpan={7}>
                {t.states.none}
              </td>
            </tr>
          ) : (
            groups.map((group) => {
              const expanded = expandedKey === group.groupKey;
              return (
                <Fragment key={group.groupKey}>
                  <tr>
                    <td className="px-3 py-2 align-top text-zinc-900">{group.sku}</td>
                    <td className="px-3 py-2 align-top text-zinc-900">{group.name}</td>
                    <td className="px-3 py-2 align-top text-zinc-900">{group.totalQtyRemaining}</td>
                    <td className="px-3 py-2 align-top text-zinc-900">{formatQty(group.availableQty)}</td>
                    <td className="px-3 py-2 align-top text-zinc-900">{group.stockGap}</td>
                    <td className="px-3 py-2 align-top text-zinc-900">{group.orderCount}</td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="text-xs text-cyan-700 underline"
                        onClick={() => onToggle(group.groupKey)}
                      >
                        {expanded ? t.labels.hideOrders : t.labels.showOrders}
                      </button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr>
                      <td className="bg-zinc-50 px-3 py-2" colSpan={7}>
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 text-left font-medium text-zinc-600">
                                {strings.payments.order}
                              </th>
                              <th className="px-2 py-1 text-left font-medium text-zinc-600">
                                {t.labels.qty}
                              </th>
                              <th className="px-2 py-1 text-left font-medium text-zinc-600">
                                {t.labels.onStock}
                              </th>
                              <th className="px-2 py-1 text-left font-medium text-zinc-600">
                                {t.labels.status}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.orders.map((order) => (
                              <tr key={order.orderItemId}>
                                <td className="px-2 py-1">
                                  <Link
                                    href={`/orders?orderId=${encodeURIComponent(order.orderId)}`}
                                    className="text-cyan-700 underline"
                                  >
                                    {order.orderNumber}
                                  </Link>
                                </td>
                                <td className="px-2 py-1 text-zinc-900">{order.qtyRemaining}</td>
                                <td className="px-2 py-1 text-zinc-900">
                                  {formatQty(order.availableQty)}
                                </td>
                                <td className="px-2 py-1">
                                  <StockReadinessBadge readiness={order.stockReadiness} size="xs" />
                                  {!order.stockReadiness || order.stockReadiness === "NONE"
                                    ? "—"
                                    : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function TodayScreen({
  onError,
  onNavigate,
}: {
  onError: (msg: string) => void;
  onNavigate: (tab: "pack" | "make") => void;
}) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [data, setData] = useState<PlanningTodayView | null>(null);
  const [busy, setBusy] = useState(false);
  const [expandedAwaitingKey, setExpandedAwaitingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await planningApi.getToday());
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadDashboard);
    }
  }, [reportError, t.errors.loadDashboard]);

  useEffect(() => {
    void load();
  }, [load]);

  const snap = data?.freshness.snapshot;
  const sales = data?.freshness.sales;

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              snap?.isFresh ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {t.labels.snapshot1C}:{" "}
            {snap?.isFresh ? t.states.fresh : t.states.stale}
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
          {data?.mrpComputedAt ? (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
              MRP: {formatDateTime(data.mrpComputedAt)}
            </span>
          ) : null}
          <button
            type="button"
            disabled={busy}
            className="ml-auto rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  await planningApi.runMrp("FULL");
                  await load();
                } catch (e) {
                  reportError(e instanceof Error ? e.message : t.errors.runMrp);
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {t.actions.recalculateMrp}
          </button>
        </div>
        {data?.freshness.mrpStale ? (
          <p className="mt-2 text-sm text-amber-800">
            {data.freshness.mrpStaleWarning ?? t.messages.mrpStaleWarn}
          </p>
        ) : null}
      </Panel>

      {(data?.dueReminders?.length ?? 0) > 0 ? (
        <Panel title={t.labels.dueToday}>
          <p className="mb-3 text-sm text-zinc-600">{t.labels.dueTodayHint}</p>
          <SimpleTable
            headers={[
              t.labels.actionType,
              t.labels.dueAt,
              t.labels.status,
              t.labels.lineCount,
              t.labels.qty,
              t.labels.actions,
            ]}
            rows={(data?.dueReminders ?? []).map((item: PlanningDueReminder) => [
              item.kind === "factory" ? t.tabs.factory : t.tabs.packing,
              <span
                key={`${item.id}-due`}
                className={item.isOverdue ? "font-medium text-rose-700" : undefined}
              >
                {formatDateTime(item.dueAt)}
                {item.isOverdue ? ` (${t.labels.dueOverdue})` : ""}
              </span>,
              item.status,
              String(item.lineCount),
              String(item.totalQty),
              <span key={`${item.id}-act`} className="flex flex-wrap gap-2">
                <Link
                  href={item.kind === "factory" ? "/planning?tab=make" : "/planning?tab=pack"}
                  className="text-cyan-700 underline"
                >
                  {t.actions.open}
                </Link>
                {item.kind === "packing" ? (
                  <button
                    type="button"
                    className="text-emerald-700 underline"
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        try {
                          await planningApi.markPackingDone(item.id);
                          await load();
                        } catch (e) {
                          reportError(e instanceof Error ? e.message : t.errors.packing);
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    {t.actions.markPackingComplete}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="text-emerald-700 underline"
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        try {
                          const order = await planningApi.listFactoryOrders(50).then((orders) =>
                            orders.find((o) => o.id === item.id),
                          );
                          if (!order?.lines?.length) return;
                          await planningApi.updateFactoryReceived(
                            item.id,
                            order.lines.map((l) => ({
                              partProductId: l.partProductId,
                              qtyReceived: l.qtyOrdered,
                            })),
                          );
                          await load();
                        } catch (e) {
                          reportError(e instanceof Error ? e.message : t.errors.factory);
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    {t.actions.markFactoryReceived}
                  </button>
                )}
              </span>,
            ])}
            noDataLabel={t.states.none}
          />
        </Panel>
      ) : null}

      <Panel title={t.labels.awaitingStock}>
        <p className="mb-1 text-sm text-zinc-600">{t.labels.awaitingStockHint}</p>
        <p className="mb-3 text-xs text-zinc-500">
          {t.labels.awaitingStockSummary(
            data?.awaitingStock?.summary.skuCount ?? 0,
            data?.awaitingStock?.summary.orderCount ?? 0,
            data?.awaitingStock?.summary.totalQty ?? 0,
          )}
        </p>
        <AwaitingStockTable
          groups={data?.awaitingStock?.groups ?? []}
          expandedKey={expandedAwaitingKey}
          onToggle={(key) => setExpandedAwaitingKey((prev) => (prev === key ? null : key))}
        />
      </Panel>

      <Panel title={t.labels.burningNow}>
        <SimpleTable
          headers={[
            t.labels.sku,
            t.labels.name,
            t.labels.needQty,
            t.labels.desiredDate,
            t.labels.whatToDo,
          ]}
          rows={(data?.burning ?? []).map((item: TodayBurningItem) => [
            item.sku,
            item.name,
            String(item.needQty),
            item.desiredDate,
            <span key={item.lineId} className="flex flex-wrap gap-1">
              {item.suggestedActions.map((a) => (
                <Link
                  key={a}
                  href={actionHref(a, item.sku)}
                  className="rounded-md border border-cyan-600 px-2 py-0.5 text-xs text-cyan-700 hover:bg-cyan-50"
                >
                  {actionLabel(a)}
                </Link>
              ))}
            </span>,
          ])}
          noDataLabel={t.states.nothingBurning}
        />
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard
          title={t.labels.packNowCard}
          value={`${data?.packSummary.positionCount ?? 0} / ${data?.packSummary.totalQty ?? 0}`}
          subtitle={t.labels.positionsAndQty}
          href="/planning?tab=pack"
        />
        <button type="button" className="text-left" onClick={() => onNavigate("make")}>
          <StatCard
            title={t.labels.makeNowCard}
            value={`${data?.makeSummary.positionCount ?? 0} / ${data?.makeSummary.totalQty ?? 0}`}
            subtitle={t.labels.positionsAndQty}
          />
        </button>
      </div>

      {data?.quota ? (
        <Panel title={t.labels.monthlyQuota}>
          <QuotaBar used={data.quota.used} quota={data.quota.total} />
        </Panel>
      ) : null}
    </div>
  );
}

type PackFilter = "can" | "blocked" | "all";

type PackRow = {
  productId: string;
  sku: string;
  name: string;
  packNeed: number;
  maxFromParts: number;
  packQty: number;
  partsGap: number;
  desiredDate: string;
  bottleneckSku: string | null;
  blocked: boolean;
  lineId?: string;
};

function mergePackRows(
  needItems: ActionListItem[],
  canItems: ActionListItem[],
  blockedItems: ActionListItem[],
): PackRow[] {
  const byProduct = new Map<string, PackRow>();
  for (const item of needItems) {
    const packNeed = item.packNeed ?? item.qty;
    const maxFromParts = item.maxFromParts ?? 0;
    byProduct.set(item.productId, {
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      packNeed,
      maxFromParts,
      packQty: Math.min(packNeed, maxFromParts),
      partsGap: Math.max(0, packNeed - maxFromParts),
      desiredDate: item.desiredDate,
      bottleneckSku: item.bottleneckSku ?? null,
      blocked: maxFromParts <= 0 && packNeed > 0,
      lineId: item.lineId,
    });
  }
  for (const item of canItems) {
    const existing = byProduct.get(item.productId);
    const packNeed = item.packNeed ?? existing?.packNeed ?? item.qty;
    const maxFromParts = item.maxFromParts ?? item.qty;
    const packQty = Math.min(packNeed, maxFromParts);
    byProduct.set(item.productId, {
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      packNeed,
      maxFromParts,
      packQty,
      partsGap: Math.max(0, packNeed - maxFromParts),
      desiredDate: item.desiredDate,
      bottleneckSku: item.bottleneckSku ?? existing?.bottleneckSku ?? null,
      blocked: false,
      lineId: item.lineId,
    });
  }
  for (const item of blockedItems) {
    const packNeed = item.packNeed ?? item.qty;
    byProduct.set(item.productId, {
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      packNeed,
      maxFromParts: 0,
      packQty: 0,
      partsGap: packNeed,
      desiredDate: item.desiredDate,
      bottleneckSku: item.bottleneckSku ?? null,
      blocked: true,
      lineId: item.lineId,
    });
  }
  return [...byProduct.values()].sort((a, b) => a.desiredDate.localeCompare(b.desiredDate));
}

export function PackScreen({
  onError,
  skuFilter,
}: {
  onError: (msg: string) => void;
  skuFilter?: string | null;
}) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [rows, setRows] = useState<PackRow[]>([]);
  const [filter, setFilter] = useState<PackFilter>("all");
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineById, setLineById] = useState<Map<string, MrpRunLine>>(new Map());

  const load = useCallback(async () => {
    try {
      const res = await planningApi.getMrpPackaging();
      setRows(
        mergePackRows(res.needItems ?? [], res.canItems ?? [], res.blockedItems ?? []),
      );
      setLineById(new Map([...res.needPack, ...res.canPack].map((l) => [l.id, l])));
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    }
  }, [reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (skuFilter) setFilter("all");
  }, [skuFilter]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "can") list = list.filter((r) => r.maxFromParts > 0);
    if (filter === "blocked") list = list.filter((r) => r.blocked);
    if (skuFilter) {
      const q = skuFilter.toLowerCase();
      list = list.filter((r) => r.sku.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filter, skuFilter]);

  const exportCsv = () => {
    const header = "sku,packNeed,maxFromParts,packQty,desiredDate,bottleneck\n";
    const body = filtered
      .map(
        (r) =>
          `${r.sku},${r.packNeed},${r.maxFromParts},${r.packQty},${r.desiredDate},${r.bottleneckSku ?? ""}`,
      )
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pack.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.packScreenHint}</p>
      <div className="flex flex-wrap gap-2">
        {(["all", "can", "blocked"] as PackFilter[]).map((f) => (
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
        <button
          type="button"
          disabled={busy}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                await planningApi.proposePackingList();
                await load();
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
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
          onClick={exportCsv}
        >
          {t.actions.exportCsv}
        </button>
      </div>
      <Panel title={t.tabs.pack}>
        <SimpleTable
          highlightSku={skuFilter}
          headers={[
            <>
              {t.labels.sku}
              <span className="ml-1 text-xs text-zinc-400" title={t.labels.maxBuildNowHint}>
                ⓘ
              </span>
            </>,
            t.labels.name,
            t.labels.packNeed,
            t.labels.maxFromParts,
            t.labels.partsGap,
            t.labels.packQty,
            t.labels.desiredDate,
            t.labels.bottleneck,
            t.labels.actions,
          ]}
          rows={filtered.map((row) => {
            const line = row.lineId ? lineById.get(row.lineId) : undefined;
            const breakdown = line?.details?.breakdown as Record<string, unknown> | undefined;
            return [
              row.sku,
              row.name,
              String(row.packNeed),
              String(row.maxFromParts),
              String(row.partsGap),
              String(row.packQty),
              row.desiredDate,
              row.bottleneckSku ?? "—",
              <>
                {breakdown ? (
                  <button
                    type="button"
                    className="text-xs text-cyan-700 underline"
                    onClick={() =>
                      setExpandedId(expandedId === row.productId ? null : row.productId)
                    }
                  >
                    {expandedId === row.productId ? t.actions.hideBreakdown : t.actions.showBreakdown}
                  </button>
                ) : null}
                {expandedId === row.productId && breakdown ? (
                  <pre className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-zinc-500">
                    {JSON.stringify(breakdown, null, 2)}
                  </pre>
                ) : null}
              </>,
            ];
          })}
          noDataLabel={t.states.noData}
        />
      </Panel>
    </div>
  );
}

type MakeFilter = "all" | "production" | "factory" | "openBatch";

type MakeRow = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  needQty: number;
  desiredDate: string;
  actionType: "production" | "factory";
  kind: string;
  hasOpenBatch: boolean;
  lineId?: string;
  partProductId?: string;
  suggestedQty?: number;
};

export function MakeOrderScreen({
  onError,
  skuFilter,
}: {
  onError: (msg: string) => void;
  skuFilter?: string | null;
}) {
  const t = strings.planning;
  const reportError = useStableErrorHandler(onError);
  const [rows, setRows] = useState<MakeRow[]>([]);
  const [filter, setFilter] = useState<MakeFilter>("all");
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [busyFactory, setBusyFactory] = useState(false);
  const [lineById, setLineById] = useState<Map<string, MrpRunLine>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [prod, factory] = await Promise.all([
        planningApi.getMrpProductionOrders(0),
        planningApi.getFactoryRecommendations(),
      ]);
      const makeRows: MakeRow[] = [];
      for (const item of prod.items ?? []) {
        makeRows.push({
          key: `prod-${item.lineId}`,
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          needQty: item.qty,
          desiredDate: item.desiredDate,
          actionType: "production",
          kind: item.lineType === "SEMI_REORDER" ? "PART" : "KIT",
          hasOpenBatch: item.blockers?.includes("open_batch_exists") ?? false,
          lineId: item.lineId,
        });
      }
      for (const rec of factory.recommendations) {
        if (rec.suggestedQty <= 0) continue;
        makeRows.push({
          key: `factory-${rec.partProductId}`,
          productId: rec.partProductId,
          sku: rec.sku,
          name: rec.name,
          needQty: rec.suggestedQty,
          desiredDate: factory.dueAt.slice(0, 10),
          actionType: "factory",
          kind: "PART",
          hasOpenBatch: false,
          partProductId: rec.partProductId,
          suggestedQty: rec.suggestedQty,
        });
      }
      setRows(makeRows);
      setLineById(new Map((prod.lines ?? []).map((l) => [l.id, l])));
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.loadMrp);
    }
  }, [reportError, t.errors.loadMrp]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === "production") list = list.filter((r) => r.actionType === "production");
    if (filter === "factory") list = list.filter((r) => r.actionType === "factory");
    if (filter === "openBatch") list = list.filter((r) => r.hasOpenBatch);
    if (skuFilter) {
      const q = skuFilter.toLowerCase();
      list = list.filter((r) => r.sku.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filter, skuFilter]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">{t.messages.makeScreenHint}</p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", t.filters.all],
            ["production", t.filters.production],
            ["factory", t.filters.factory],
            ["openBatch", t.filters.openBatch],
          ] as const
        ).map(([f, label]) => (
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
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={busyFactory}
          className="ml-auto rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm"
          onClick={() => {
            void (async () => {
              setBusyFactory(true);
              try {
                const factory = await planningApi.getFactoryRecommendations();
                await planningApi.createFactoryOrder({
                  lines: factory.recommendations.map((r) => ({
                    partProductId: r.partProductId,
                    qtyOrdered: r.suggestedQty,
                  })),
                });
                await load();
              } catch (e) {
                reportError(e instanceof Error ? e.message : t.errors.factory);
              } finally {
                setBusyFactory(false);
              }
            })();
          }}
        >
          {t.actions.createFactoryOrder}
        </button>
      </div>
      <Panel title={t.tabs.make}>
        <SimpleTable
          highlightSku={skuFilter}
          headers={[
            t.labels.sku,
            t.labels.name,
            t.labels.packNeed,
            t.labels.desiredDate,
            t.labels.actionType,
            t.labels.wipStatus,
            t.labels.actions,
          ]}
          rows={filtered.map((row) => {
            const line = row.lineId ? lineById.get(row.lineId) : undefined;
            const breakdown = line?.details?.breakdown as Record<string, unknown> | undefined;
            return [
              row.sku,
              row.name,
              String(row.needQty),
              row.desiredDate,
              row.actionType === "factory" ? t.actions.goFactory : t.actions.goProduction,
              row.hasOpenBatch ? t.labels.openBatch : "—",
              <>
                {row.actionType === "production" && row.lineId ? (
                  <button
                    type="button"
                    disabled={creatingId === row.lineId || row.hasOpenBatch}
                    className="rounded-md bg-cyan-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                    onClick={() => {
                      void (async () => {
                        setCreatingId(row.lineId!);
                        try {
                          await planningApi.createBatchFromMrpLine(row.lineId!);
                          await load();
                        } catch (e) {
                          reportError(e instanceof Error ? e.message : t.errors.createBatch);
                        } finally {
                          setCreatingId(null);
                        }
                      })();
                    }}
                  >
                    {creatingId === row.lineId ? strings.common.loading : t.actions.createBatch}
                  </button>
                ) : null}
                {row.actionType === "factory" && row.partProductId ? (
                  <button
                    type="button"
                    disabled={busyFactory}
                    className="rounded-md border border-cyan-600 px-2 py-1 text-xs text-cyan-700"
                    onClick={() => {
                      void (async () => {
                        setBusyFactory(true);
                        try {
                          await planningApi.createFactoryOrder({
                            lines: [
                              {
                                partProductId: row.partProductId!,
                                qtyOrdered: row.suggestedQty ?? row.needQty,
                              },
                            ],
                          });
                          await load();
                        } catch (e) {
                          reportError(e instanceof Error ? e.message : t.errors.factory);
                        } finally {
                          setBusyFactory(false);
                        }
                      })();
                    }}
                  >
                    {t.actions.goFactory}
                  </button>
                ) : null}
                {breakdown ? (
                  <button
                    type="button"
                    className="ml-2 text-xs text-cyan-700 underline"
                    onClick={() => setExpandedId(expandedId === row.key ? null : row.key)}
                  >
                    {expandedId === row.key ? t.actions.hideBreakdown : t.actions.showBreakdown}
                  </button>
                ) : null}
                {expandedId === row.key && breakdown ? (
                  <pre className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-zinc-500">
                    {JSON.stringify(breakdown, null, 2)}
                  </pre>
                ) : null}
              </>,
            ];
          })}
          noDataLabel={t.states.noData}
        />
      </Panel>
    </div>
  );
}
