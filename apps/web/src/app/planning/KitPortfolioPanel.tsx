"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { strings } from "@/locales";
import {
  planningApi,
  type KitPortfolioKit,
  type KitPortfolioView,
} from "@/lib/api/resources/planning";

function useStableErrorHandler(onError: (msg: string) => void) {
  const ref = useRef(onError);
  ref.current = onError;
  return useCallback((msg: string) => {
    ref.current(msg);
  }, []);
}

function matchesQuery(kit: KitPortfolioKit, q: string): boolean {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return kit.sku.toLowerCase().includes(n) || kit.name.toLowerCase().includes(n);
}

function sortEnding(rows: KitPortfolioKit[]): KitPortfolioKit[] {
  return [...rows].sort((a, b) => {
    const aCan = a.maxBuildNow > 0 ? 0 : 1;
    const bCan = b.maxBuildNow > 0 ? 0 : 1;
    if (aCan !== bCan) return aCan - bCan;
    const aw = a.weeksOfCover ?? 9999;
    const bw = b.weeksOfCover ?? 9999;
    if (aw !== bw) return aw - bw;
    const abc = (a.paretoClass === "A" ? 0 : a.paretoClass === "B" ? 1 : 2) -
      (b.paretoClass === "A" ? 0 : b.paretoClass === "B" ? 1 : 2);
    if (abc !== 0) return abc;
    const xyzRank = (c: string | null) => (c === "X" ? 0 : c === "Y" ? 1 : c === "Z" ? 2 : 3);
    const xyz = xyzRank(a.xyzClass) - xyzRank(b.xyzClass);
    if (xyz !== 0) return xyz;
    return b.revenue - a.revenue;
  });
}

function WeekBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const bar =
    pct >= 90 ? "bg-emerald-500" : pct >= 50 ? "bg-cyan-600" : "bg-amber-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-600">
        <span>
          {used} / {limit}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: Array<{ yearMonth: string; qty: number }> }) {
  if (points.length === 0) return <div className="h-8" />;
  const max = Math.max(1, ...points.map((p) => p.qty));
  return (
    <div className="flex h-8 items-end gap-px" title={points.map((p) => `${p.yearMonth}: ${p.qty}`).join(" · ")}>
      {points.map((p) => (
        <div
          key={p.yearMonth}
          className="min-w-[3px] flex-1 rounded-t bg-zinc-400/80"
          style={{ height: `${Math.max(8, Math.round((p.qty / max) * 100))}%` }}
        />
      ))}
    </div>
  );
}

function WeeksHero({ kit }: { kit: KitPortfolioKit }) {
  const t = strings.planning.kitBoard;
  const tone =
    kit.coverTone === "critical"
      ? "text-rose-700"
      : kit.coverTone === "warn"
        ? "text-amber-700"
        : "text-zinc-800";
  if (kit.weeksOfCover == null) {
    return <p className="text-lg font-semibold text-zinc-400">{t.weeksUnknown}</p>;
  }
  return (
    <p className={`text-3xl font-semibold leading-none ${tone}`}>
      {kit.weeksOfCover}
      <span className="ml-1 text-sm font-medium text-zinc-500">{t.weeksUnit}</span>
    </p>
  );
}

function StockSplit({ finished, buildable }: { finished: number; buildable: number }) {
  const t = strings.planning.kitBoard;
  const total = Math.max(1, finished + buildable);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-600">
        <span>{t.finished(finished)}</span>
        <span>{t.fromParts(buildable)}</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full bg-zinc-800" style={{ width: `${(finished / total) * 100}%` }} />
        <div className="h-full bg-cyan-500" style={{ width: `${(buildable / total) * 100}%` }} />
      </div>
    </div>
  );
}

export function KitPortfolioPanel({
  onError,
  view: externalView,
  busy: externalBusy,
  onReload,
}: {
  onError: (msg: string) => void;
  view?: KitPortfolioView | null;
  busy?: boolean;
  onReload?: () => Promise<void>;
}) {
  const t = strings.planning;
  const kb = t.kitBoard;
  const reportError = useStableErrorHandler(onError);
  const [internalView, setInternalView] = useState<KitPortfolioView | null>(null);
  const [internalBusy, setInternalBusy] = useState(false);
  const view = externalView !== undefined ? externalView : internalView;
  const busy = externalBusy ?? internalBusy;
  const [toast, setToast] = useState<string | null>(null);
  const [only80, setOnly80] = useState(true);
  const [abcFilter, setAbcFilter] = useState<Array<"A" | "B" | "C">>(["A"]);
  const [xyzFilter, setXyzFilter] = useState<Array<"X" | "Y" | "Z">>([]);
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const loadInternal = useCallback(async () => {
    setInternalBusy(true);
    try {
      setInternalView(await planningApi.getKitPortfolio());
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.kitPortfolio);
    } finally {
      setInternalBusy(false);
    }
  }, [reportError, t.errors.kitPortfolio]);

  const load = useCallback(async () => {
    if (onReload) {
      await onReload();
      return;
    }
    await loadInternal();
  }, [onReload, loadInternal]);

  useEffect(() => {
    if (externalView !== undefined) return;
    void loadInternal();
  }, [externalView, loadInternal]);

  const visible = useMemo(() => {
    let rows = (view?.kits ?? []).filter((k) => matchesQuery(k, query));
    if (only80 || abcFilter.length > 0) {
      const abcSet = new Set(only80 && abcFilter.length === 0 ? (["A"] as const) : abcFilter);
      if (only80 && abcFilter.length === 0) {
        rows = rows.filter((k) => k.inPareto80);
      } else if (abcFilter.length > 0) {
        rows = rows.filter((k) => abcSet.has(k.paretoClass));
      }
    }
    if (xyzFilter.length > 0) {
      const xyzSet = new Set(xyzFilter);
      rows = rows.filter((k) => k.xyzClass != null && xyzSet.has(k.xyzClass));
    }
    return rows;
  }, [view, query, only80, abcFilter, xyzFilter]);

  const ending = useMemo(
    () => sortEnding(visible.filter((k) => k.pile === "ending")),
    [visible],
  );
  const ok = useMemo(
    () => visible.filter((k) => k.pile === "ok"),
    [visible],
  );
  const idle = useMemo(
    () => visible.filter((k) => k.pile === "idle"),
    [visible],
  );

  const visibleIds = useMemo(() => new Set(ending.map((k) => k.productId)), [ending]);
  const shared = useMemo(
    () =>
      (view?.sharedBottlenecks ?? []).filter((g) => {
        const n = g.kitIds.filter((id) => visibleIds.has(id)).length;
        return n >= 2;
      }),
    [view, visibleIds],
  );

  const addToPack = async (kit: KitPortfolioKit) => {
    if (kit.suggestedPackQty <= 0 || kit.suggestedPackTargetQty > kit.maxBuildNow) return;
    setActing(kit.productId);
    try {
      let listId = view?.week.packingListId ?? null;
      let status = view?.week.packingStatus ?? null;
      if (status === "APPROVED") {
        if (!listId) {
          reportError(t.errors.packing);
          return;
        }
        const reopened = await planningApi.reopenPackingList(listId);
        listId = reopened.id;
        status = reopened.status;
      }
      if (!listId) {
        const proposed = await planningApi.proposePackingList();
        listId = proposed.list.id;
        status = proposed.list.status;
      }
      if (!listId || status !== "DRAFT") {
        reportError(t.errors.packing);
        return;
      }
      const nextQty = kit.suggestedPackTargetQty;
      await planningApi.setPackingKitQty(listId, kit.productId, nextQty);
      setToast(kb.packedToast(kit.sku, nextQty));
      await load();
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.packing);
    } finally {
      setActing(null);
    }
  };

  const orderPart = async (componentId: string, qty: number, label: string) => {
    setActing(componentId);
    try {
      let draftId = view?.week.factoryDraftId ?? null;
      if (!draftId) {
        const created = await planningApi.createFactoryOrder({
          lines: [{ partProductId: componentId, qtyOrdered: qty }],
        });
        draftId = created.id;
      } else {
        await planningApi.addFactoryLine(draftId, {
          partProductId: componentId,
          qtyOrdered: qty,
        });
      }
      setToast(kb.factoryToast(label, qty));
      await load();
    } catch (e) {
      reportError(e instanceof Error ? e.message : t.errors.factory);
    } finally {
      setActing(null);
    }
  };

  if (!view && busy) {
    return <p className="text-sm text-zinc-500">{strings.common.loading}</p>;
  }
  if (!view) return <p className="text-sm text-zinc-500">{t.states.noData}</p>;

  const showToolbar = externalView === undefined;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">{kb.title}</h2>
            <p className="mt-1 text-sm text-zinc-600">{kb.hint}</p>
          </div>
          {showToolbar ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnly80(true)}
                className={
                  only80
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white"
                    : "rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
                }
              >
                {kb.filter80}
              </button>
              <button
                type="button"
                onClick={() => setOnly80(false)}
                className={
                  !only80
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white"
                    : "rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
                }
              >
                {kb.filterAll}
              </button>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kb.search}
                className="w-48 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
                onClick={() => void load()}
              >
                {t.actions.refresh}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnly80(true)}
                className={
                  only80
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white"
                    : "rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
                }
              >
                {kb.filter80}
              </button>
              <button
                type="button"
                onClick={() => setOnly80(false)}
                className={
                  !only80
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-sm text-white"
                    : "rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
                }
              >
                {kb.filterAll}
              </button>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={kb.search}
                className="w-48 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{kb.weekRequest}</p>
            <div className="mt-2">
              <WeekBar used={view.week.used} limit={view.week.limit} />
            </div>
          </div>
          <p className="self-end text-sm text-zinc-700">
            {kb.todayLine(view.summary.packableToday, view.summary.blocked, view.summary.axEnding)}
          </p>
        </div>
        {(view.classMatrix?.length ?? 0) > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{kb.matrixTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {view.classMatrix.map((cell) => (
                <span
                  key={`${cell.paretoClass}${cell.xyzClass}`}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs text-zinc-700"
                >
                  {kb.classBadge(cell.paretoClass, cell.xyzClass)}: {cell.skuCount}
                  {cell.endingCount > 0 ? ` · ${cell.endingCount}⚠` : ""}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {kb.classHintAx} · {kb.classHintAz}
            </p>
          </div>
        ) : null}
        {toast ? (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{toast}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-rose-900">{kb.pileEnding}</h3>
            <span className="text-xs text-rose-800">{kb.count(ending.length)}</span>
          </div>
          {shared.map((g) => (
            <div
              key={g.componentId}
              className="mb-3 rounded-xl border border-rose-200 bg-white p-3"
            >
              <p className="text-sm font-medium text-zinc-900">
                {kb.sharedPart(g.name || g.sku, g.kitCount)}
              </p>
              <button
                type="button"
                disabled={acting === g.componentId}
                className="mt-2 rounded-lg bg-rose-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void orderPart(g.componentId, g.suggestedQty, g.name || g.sku)}
              >
                {kb.orderPart(g.name || g.sku, g.suggestedQty)}
              </button>
            </div>
          ))}
          {ending.length === 0 ? (
            <p className="rounded-xl bg-white/80 p-4 text-sm text-emerald-900">{kb.endingEmpty}</p>
          ) : (
            <div className="space-y-3">
              {ending.map((kit) => (
                <EndingCard
                  key={kit.productId}
                  kit={kit}
                  open={openId === kit.productId}
                  busy={acting === kit.productId}
                  onToggle={() => setOpenId((id) => (id === kit.productId ? null : kit.productId))}
                  onPack={() => void addToPack(kit)}
                  onOrderPart={() => {
                    if (!kit.bottleneckComponentId) return;
                    void orderPart(
                      kit.bottleneckComponentId,
                      Math.max(1, kit.suggestedFactoryQty),
                      kit.bottleneckName || kit.bottleneckSku || "",
                    );
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-800">{kb.pileOk}</h3>
            <span className="text-xs text-zinc-500">{kb.count(ok.length)}</span>
          </div>
          {ok.length === 0 ? (
            <p className="px-1 py-6 text-sm text-zinc-500">{t.states.noData}</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {ok.map((kit) => (
                <CompactRow key={kit.productId} kit={kit} muted={false} />
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-zinc-100/80 p-3 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-zinc-600">{kb.pileIdle}</h3>
            <span className="text-xs text-zinc-500">{kb.count(idle.length)}</span>
          </div>
          {idle.length === 0 ? (
            <p className="px-1 py-6 text-sm text-zinc-500">{t.states.noData}</p>
          ) : (
            <ul className="divide-y divide-zinc-200">
              {idle.map((kit) => (
                <CompactRow key={kit.productId} kit={kit} muted />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function PositionPlanRow({
  kit,
  compact,
}: {
  kit: KitPortfolioKit;
  compact?: boolean;
}) {
  const t = strings.planning;
  const kb = t.kitBoard;
  const grid = compact
    ? "mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-600"
    : "mt-3 grid grid-cols-3 gap-2 rounded-lg bg-zinc-50 p-2 text-center";
  const labelClass = compact ? "text-zinc-500" : "text-[10px] font-medium uppercase tracking-wide text-zinc-500";
  const valueClass = compact ? "font-medium text-zinc-800" : "text-lg font-semibold text-zinc-900";

  return (
    <div className={grid} title={kb.positionPlanHint}>
      <div className={compact ? undefined : "min-w-0"}>
        {!compact ? <p className={labelClass}>{t.labels.targetStockShort}</p> : null}
        <p className={valueClass}>
          {compact ? (
            <>
              <span className={labelClass}>{t.labels.targetStockShort}: </span>
              {t.labels.stockNowVsTarget(kit.stockNow, kit.targetStock)}
            </>
          ) : (
            t.labels.stockNowVsTarget(kit.stockNow, kit.targetStock)
          )}
        </p>
      </div>
      <div className={compact ? undefined : "min-w-0"}>
        {!compact ? <p className={labelClass}>{t.labels.canPackNow}</p> : null}
        <p className={`${valueClass} ${kit.canPackNow > 0 ? "text-cyan-700" : ""}`}>
          {compact ? (
            <>
              <span className={labelClass}>{t.labels.canPackNow}: </span>
              {kit.canPackNow}
            </>
          ) : (
            kit.canPackNow
          )}
        </p>
      </div>
      <div className={compact ? undefined : "min-w-0"}>
        {!compact ? <p className={labelClass}>{t.labels.toWork}</p> : null}
        <p className={`${valueClass} ${kit.toWork > 0 ? "text-rose-700" : ""}`}>
          {compact ? (
            <>
              <span className={labelClass}>{t.labels.toWork}: </span>
              {kit.toWork}
            </>
          ) : (
            kit.toWork
          )}
        </p>
        {!compact && kit.toWork > 0 && kit.bottleneckSku ? (
          <p className="mt-0.5 truncate text-[10px] text-rose-600">
            {kb.orderPart(kit.bottleneckName || kit.bottleneckSku, kit.suggestedFactoryQty)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function EndingCard({
  kit,
  open,
  busy,
  onToggle,
  onPack,
  onOrderPart,
}: {
  kit: KitPortfolioKit;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onPack: () => void;
  onOrderPart: () => void;
}) {
  const kb = strings.planning.kitBoard;
  const canPack =
    kit.suggestedPackQty > 0 &&
    kit.suggestedPackTargetQty <= kit.maxBuildNow &&
    kit.maxBuildNow > 0;
  const packDisabledReason =
    kit.alreadyInRequest >= kit.maxBuildNow
      ? kb.atPartsCap
      : kit.suggestedPackQty <= 0
        ? kb.noPackNeed
        : null;
  const needFactory = kit.maxBuildNow <= 0 && kit.bottleneckSku;
  const border =
    kit.coverTone === "critical" ? "border-rose-300" : "border-amber-200";
  return (
    <article className={`rounded-xl border bg-white p-3 shadow-sm ${border}`}>
      <button type="button" className="w-full text-left" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900">
              <span className="mr-2 inline-block rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {kb.classBadge(kit.paretoClass, kit.xyzClass)}
              </span>
              {kit.name}
            </p>
            <p className="text-xs text-zinc-500">{kit.sku}</p>
          </div>
          <WeeksHero kit={kit} />
        </div>
        <div className="mt-3">
          <StockSplit finished={kit.stockFinished} buildable={kit.maxBuildNow} />
        </div>
        <PositionPlanRow kit={kit} />
        {kit.waitingOrders > 0 ? (
          <p className="mt-2 text-xs font-medium text-rose-800">{kb.waiting(kit.waitingOrders)}</p>
        ) : null}
        {kit.endingReason ? (
          <p className="mt-1 text-xs font-medium text-amber-800">
            {kit.endingReason === "orders"
              ? kb.endingOrders
              : kit.endingReason === "cover"
                ? kb.endingCover
                : kb.endingBoth}
          </p>
        ) : null}
        <div className="mt-2">
          <Sparkline points={kit.monthlyHistory} />
        </div>
      </button>
      {kit.alreadyInRequest > 0 ? (
        <p className="mt-2 text-xs text-cyan-800">{kb.inRequest(kit.alreadyInRequest)}</p>
      ) : null}
      {canPack ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          onClick={onPack}
          title={packDisabledReason ?? undefined}
        >
          {kb.addToRequest(kit.suggestedPackTargetQty, kit.suggestedPackQty)}
        </button>
      ) : packDisabledReason && kit.maxBuildNow > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">{packDisabledReason}</p>
      ) : needFactory ? (
        <button
          type="button"
          disabled={busy}
          className="mt-3 w-full rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={onOrderPart}
        >
                      {kb.orderPart(kit.bottleneckName || kit.bottleneckSku || "", 0)}
        </button>
      ) : null}
      {open ? (
        <div className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
          {kit.components.map((c) => (
            <p key={c.componentProductId} className={c.isBottleneck ? "text-rose-700" : undefined}>
              {c.name} · {c.qtyPerKit}/{strings.planning.kitBoard.perKit} · {c.available}
            </p>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function CompactRow({ kit, muted }: { kit: KitPortfolioKit; muted: boolean }) {
  const kb = strings.planning.kitBoard;
  const weeks =
    kit.weeksOfCover != null ? `${kit.weeksOfCover} ${kb.weeksUnit}` : kb.weeksUnknown;
  return (
    <li className={`flex items-baseline justify-between gap-2 px-1 py-2 ${muted ? "text-zinc-500" : "text-zinc-800"}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{kit.name}</p>
        <p className="text-xs text-zinc-500">
          {kit.sku} · {kb.finished(kit.stockFinished)}
          {muted && kit.maxBuildNow > 0 ? ` · ${kb.dontPackMore}` : ""}
        </p>
        <PositionPlanRow kit={kit} compact />
      </div>
      <p className="shrink-0 text-xs">{weeks}</p>
    </li>
  );
}
