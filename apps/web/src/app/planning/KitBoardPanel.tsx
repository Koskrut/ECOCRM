"use client";

import { useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { apiHttp } from "@/lib/api/client";
import {
  planningApi,
  resolvePlanningUploadError,
  type KitBoardPartRow,
  type KitBoardRow,
  type KitBoardTone,
  type KitBoardView,
} from "@/lib/api/resources/planning";
import { RequestsPanel } from "./RequestsPanel";

const UNASSIGNED_WAREHOUSE_ID = "__unassigned__";
const NO_CATEGORY = "__none__";

type AttentionFilter = "all" | "attention";
type SortKey = "class" | "sku" | "stock" | "sales" | "pack" | "produce";
type SortDir = "asc" | "desc";
type RequestKind = "pack" | "produce";
type MainTab = "board" | "pack" | "factory";
type AbcFilter = "A" | "B" | "C";
type XyzFilter = "X" | "Y" | "Z" | "none";

const ABC_OPTIONS: AbcFilter[] = ["A", "B", "C"];
const XYZ_OPTIONS: XyzFilter[] = ["X", "Y", "Z", "none"];

function toggleInSet<T extends string>(prev: Set<T>, value: T): Set<T> {
  const next = new Set(prev);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

type PendingAdd = {
  kind: RequestKind;
  row: KitBoardRow;
  /** Kit qty suggested in the confirm dialog. */
  defaultQty: number;
  source: "better" | "can" | "produce";
};

const ABC_RANK: Record<string, number> = { A: 0, B: 1, C: 2 };
const XYZ_RANK: Record<string, number> = { X: 0, Y: 1, Z: 2 };

function warehouseLabel(id: string, name: string): string {
  if (id === UNASSIGNED_WAREHOUSE_ID) return strings.planning.kitBoard.unassigned;
  return name;
}

function toneClass(tone: KitBoardTone): string {
  if (tone === "pack") return "bg-emerald-50";
  if (tone === "missing_parts" || tone === "parts_shared") return "bg-amber-50";
  return "";
}

function formatAvg(value: number): string {
  if (!(value > 0)) return "—";
  return value.toLocaleString("uk-UA", { maximumFractionDigits: 1 });
}

function stockTitle(
  qtyByWarehouse: Record<string, number>,
  warehouseName: Map<string, string>,
): string {
  const lines = Object.entries(qtyByWarehouse)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => `${warehouseName.get(id) ?? id}: ${qty}`);
  return lines.length > 0 ? lines.join("\n") : "";
}

function partStockLine(
  part: KitBoardPartRow,
  warehouseName: Map<string, string>,
  packWarehouseIds: Set<string> | null,
): string {
  const bits = Object.entries(part.qtyByWarehouse)
    .filter(([id, qty]) => qty > 0 && (!packWarehouseIds || packWarehouseIds.has(id)))
    .map(([id, qty]) => {
      const name = warehouseName.get(id) ?? id;
      const short = name.replace(/^(\d+\s+)?Склад\s+/i, "").slice(0, 24);
      return `${short} ${qty}`;
    });
  return bits.length > 0 ? bits.join(" · ") : "—";
}

/**
 * Current pack-cycle draft only. Do not attach to an older cycle's leftover DRAFT/APPROVED
 * from listPackingLists (that reopened stale weeks when adding from the kit board).
 */
async function ensurePackingDraft() {
  const proposed = await planningApi.proposePackingList();
  let list = proposed.list;
  if (list.status === "APPROVED") {
    list = await planningApi.reopenPackingList(list.id);
  }
  if (list.status !== "DRAFT") {
    throw new Error(strings.planning.errors.packing);
  }
  // propose payload may omit lines — load full draft before reading qtyApproved.
  return planningApi.getPackingList(list.id);
}

async function addKitToPackingRequest(kitProductId: string, qty: number) {
  const list = await ensurePackingDraft();
  const already =
    list.lines?.find((line) => line.kitProductId === kitProductId)?.qtyApproved ?? 0;
  await planningApi.setPackingKitQty(list.id, kitProductId, already + qty);
  return list.id;
}

async function addKitPartsToFactoryRequest(row: KitBoardRow, kitQty: number) {
  const lines = row.parts
    .filter((part) => part.constrains && part.qtyPerKit > 0)
    .map((part) => ({
      partProductId: part.productId,
      qtyOrdered: Math.max(1, Math.ceil(kitQty * part.qtyPerKit)),
    }));
  if (lines.length === 0) {
    throw new Error(strings.planning.kitBoard.noParts);
  }
  const orders = await planningApi.listFactoryOrders(10);
  // Only reuse the newest order when it is still a draft — never an older abandoned DRAFT.
  const newest = orders[0] ?? null;
  if (newest?.status === "DRAFT") {
    for (const line of lines) {
      await planningApi.addFactoryLine(newest.id, line);
    }
    return newest.id;
  }
  const created = await planningApi.createFactoryOrder({ lines });
  return created.id;
}

export function KitBoardPanel() {
  const t = strings.planning.kitBoard;
  const [board, setBoard] = useState<KitBoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState<AttentionFilter>("all");
  const [abcFilter, setAbcFilter] = useState<Set<AbcFilter>>(() => new Set());
  const [xyzFilter, setXyzFilter] = useState<Set<XyzFilter>>(() => new Set());
  const [system, setSystem] = useState("");
  const [category, setCategory] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("class");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requestsKey, setRequestsKey] = useState(0);
  const [activeQty, setActiveQty] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAdd | null>(null);
  const [confirmQty, setConfirmQty] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("board");
  /** After add-to-request, open this packing/factory id in the embedded panel. */
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "sku" || key === "class" ? "asc" : "desc");
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    planningApi
      .getKitBoard()
      .then((next) => {
        if (!cancelled) setBoard(next);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : t.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, t.loadError]);

  useEffect(() => {
    void apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => {
        const role = res.data?.user?.role;
        setCanUpload(role === "ADMIN" || role === "LEAD");
      })
      .catch(() => setCanUpload(false));
  }, []);

  const warehouseName = useMemo(() => {
    const map = new Map<string, string>();
    for (const warehouse of board?.warehouses ?? []) {
      map.set(warehouse.id, warehouseLabel(warehouse.id, warehouse.name));
    }
    return map;
  }, [board]);

  const stockWarehouseIds = useMemo(() => {
    const list = board?.stockWarehouses;
    if (!list?.length) return null;
    return new Set(list.map((w) => w.id));
  }, [board]);

  const packWarehouseIds = useMemo(() => {
    const list = board?.packWarehouses;
    if (!list?.length) return null;
    return new Set(list.map((w) => w.id));
  }, [board]);

  const systems = useMemo(() => {
    const set = new Set<string>();
    for (const row of board?.rows ?? []) {
      if (row.system) set.add(row.system);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [board]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    let hasEmpty = false;
    for (const row of board?.rows ?? []) {
      if (row.category) set.add(row.category);
      else hasEmpty = true;
    }
    const list = [...set].sort((a, b) => a.localeCompare(b, "uk"));
    if (hasEmpty) list.push(NO_CATEGORY);
    return list;
  }, [board]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = (board?.rows ?? []).filter((row) => {
      // Увага = не вистачає запасу на покриття продажів (дірка need > 0).
      if (attention === "attention" && !(row.need > 0)) return false;
      if (abcFilter.size > 0 && !abcFilter.has(row.paretoClass)) return false;
      if (xyzFilter.size > 0) {
        const xyzKey: XyzFilter = row.xyzClass ?? "none";
        if (!xyzFilter.has(xyzKey)) return false;
      }
      if (system && row.system !== system) return false;
      if (category === NO_CATEGORY) {
        if (row.category) return false;
      } else if (category && row.category !== category) {
        return false;
      }
      if (!q) return true;
      const hay = [row.sku, row.name, ...row.parts.flatMap((part) => [part.sku, part.name])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "class") {
        cmp =
          (ABC_RANK[a.paretoClass] ?? 9) - (ABC_RANK[b.paretoClass] ?? 9) ||
          (XYZ_RANK[a.xyzClass ?? ""] ?? 9) - (XYZ_RANK[b.xyzClass ?? ""] ?? 9) ||
          b.need - a.need;
      } else if (sortKey === "sku") {
        cmp = a.sku.localeCompare(b.sku, "uk");
      } else if (sortKey === "stock") {
        cmp = (a.qtyStockTotal ?? a.qtyTotal) - (b.qtyStockTotal ?? b.qtyTotal);
      } else if (sortKey === "sales") {
        cmp = a.avgMonthlySold - b.avgMonthlySold;
      } else if (sortKey === "pack") {
        cmp = a.toPack - b.toPack;
      } else {
        cmp = a.toProduce - b.toProduce;
      }
      if (cmp !== 0) return cmp * dir;
      return a.sku.localeCompare(b.sku, "uk");
    });
  }, [abcFilter, attention, board, category, query, sortDir, sortKey, system, xyzFilter]);

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const attentionCount = (board?.rows ?? []).filter((row) => row.need > 0).length;
  const packReadyCount = (board?.rows ?? []).filter((row) => row.toPack > 0).length;

  const openConfirm = (next: PendingAdd) => {
    if (!(next.defaultQty > 0)) return;
    setPending(next);
    setConfirmQty(String(next.defaultQty));
    setActiveQty(null);
    setError(null);
  };

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(id);
  }, [toast]);

  const submitRequest = async () => {
    if (!pending) return;
    const qty = Math.floor(Number(confirmQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(t.qtyInvalid);
      return;
    }
    // Cap by board plan: sales gap and shared-part allocation (not raw physical «можна»).
    const remaining = pending.row.canAssembleRemaining ?? pending.row.canAssemble;
    const packCap =
      pending.row.toPack > 0
        ? pending.row.toPack
        : Math.min(remaining, pending.row.need > 0 ? pending.row.need : remaining);
    if (pending.kind === "pack" && packCap > 0 && qty > packCap) {
      setError(t.packQtyTooHigh(packCap));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (pending.kind === "pack") {
        const listId = await addKitToPackingRequest(pending.row.productId, qty);
        setFocusRequestId(listId);
        setToast(t.addedPack(pending.row.sku, qty));
        setMainTab("pack");
      } else {
        const orderId = await addKitPartsToFactoryRequest(pending.row, qty);
        setFocusRequestId(orderId);
        setToast(t.addedProduce(pending.row.sku, qty));
        setMainTab("factory");
      }
      setPending(null);
      setRequestsKey((key) => key + 1);
      setRefreshKey((key) => key + 1);
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : pending.kind === "pack"
            ? strings.planning.errors.packing
            : strings.planning.errors.factory,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setUploadNote(null);
    setError(null);
    try {
      const staged = await planningApi.uploadSnapshot(file);
      await planningApi.postSnapshot(staged.snapshot.id);
      setUploadNote(
        staged.unresolvedSku.length > 0
          ? t.uploadedSkipped(staged.keptRows, staged.unresolvedSku.length)
          : t.uploaded(staged.keptRows),
      );
      setRefreshKey((key) => key + 1);
    } catch (e: unknown) {
      setError(
        resolvePlanningUploadError(e, {
          fileTooLarge: strings.planning.errors.fileTooLarge,
          fallback: strings.planning.errors.uploadSnapshot,
        }),
      );
    } finally {
      setUploading(false);
    }
  };

  const packRequest = board?.packRequest;
  const capacityUsed = packRequest?.capacityUsed ?? 0;
  const capacityLimit = packRequest?.capacityLimit ?? 0;
  const capacityLeft = Math.max(0, capacityLimit - capacityUsed);
  const capacityPct =
    capacityLimit > 0 ? Math.min(100, Math.round((capacityUsed / capacityLimit) * 100)) : 0;

  const tabBtn = (id: MainTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setMainTab(id)}
      className={
        mainTab === id
          ? "rounded-full bg-cyan-600 px-4 py-2 text-sm font-medium text-white"
          : "rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("board", t.tabBoard)}
        {tabBtn("pack", t.tabPack)}
        {tabBtn("factory", t.tabFactory)}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canUpload ? (
            <label className="cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800">
              {uploading ? t.uploading : t.upload}
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(file);
                }}
              />
            </label>
          ) : null}
        </div>
      </div>

      {capacityLimit > 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-zinc-800">{t.capacityTitle}</span>
            <span className="tabular-nums text-zinc-700">
              {capacityUsed} / {capacityLimit}
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {t.capacityLeft(capacityLeft)}
              </span>
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className={
                capacityPct >= 90
                  ? "h-full bg-emerald-500"
                  : capacityPct >= 50
                    ? "h-full bg-cyan-600"
                    : "h-full bg-amber-500"
              }
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            board?.snapshotPostedAt ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
          }`}
        >
          {t.snapshot}:{" "}
          {board?.snapshotPostedAt
            ? new Date(board.snapshotPostedAt).toLocaleString("uk-UA")
            : t.noSnapshot}
        </span>
        {board ? (
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-700">
            {t.salesHint(board.lookbackMonths)}
          </span>
        ) : null}
        {mainTab === "board" ? (
          <>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
              {t.attentionCount(attentionCount)}
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
              {t.packCount(packReadyCount)}
            </span>
          </>
        ) : null}
      </div>

      {uploadNote ? <p className="text-sm text-cyan-800">{uploadNote}</p> : null}
      {toast ? <p className="text-sm text-emerald-800">{toast}</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {mainTab === "board" ? (
        <>
          <p className="text-sm text-zinc-500">{t.sharedHint}</p>
          <p className="text-sm text-zinc-500">{t.addHint}</p>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              className="w-full max-w-sm rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            {(
              [
                ["all", t.filterAll],
                ["attention", t.filterAttention],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                title={key === "attention" ? t.filterAttentionHint : undefined}
                onClick={() => setAttention(key)}
                className={
                  attention === key
                    ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                    : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
                }
              >
                {key === "attention"
                  ? `${label}${attentionCount > 0 ? ` (${attentionCount})` : ""}`
                  : label}
              </button>
            ))}
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t.filterAbc}
              </span>
              {ABC_OPTIONS.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setAbcFilter((prev) => toggleInSet(prev, cls))}
                  className={
                    abcFilter.has(cls)
                      ? "rounded-full bg-cyan-700 px-2.5 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
                  }
                >
                  {cls}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t.filterXyz}
              </span>
              {XYZ_OPTIONS.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setXyzFilter((prev) => toggleInSet(prev, cls))}
                  className={
                    xyzFilter.has(cls)
                      ? "rounded-full bg-violet-700 px-2.5 py-1 text-xs font-semibold text-white"
                      : "rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
                  }
                >
                  {cls === "none" ? t.filterXyzNone : cls}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs text-zinc-600">
              <span className="sr-only">{t.filterSystem}</span>
              <select
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800"
              >
                <option value="">{t.filterSystemAll}</option>
                {systems.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-zinc-600">
              <span className="sr-only">{t.filterCategory}</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-800"
              >
                <option value="">{t.filterCategoryAll}</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name === NO_CATEGORY ? t.noCategory : name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-600">
                  <th className="sticky left-0 z-20 bg-zinc-50 px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:text-zinc-900"
                      onClick={() => toggleSort("sku")}
                    >
                      {t.colKit}
                      {sortMark("sku")}
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-[10px] font-normal text-zinc-400 hover:text-zinc-700"
                      onClick={() => toggleSort("class")}
                    >
                      ABC{sortMark("class")}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:text-zinc-900"
                      onClick={() => toggleSort("stock")}
                    >
                      {t.colStock}
                      {sortMark("stock")}
                    </button>
                  </th>
                  <th className="min-w-[18rem] px-3 py-2">{t.colParts}</th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:text-zinc-900"
                      onClick={() => toggleSort("sales")}
                    >
                      {t.colSales}
                      {sortMark("sales")}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:text-zinc-900"
                      onClick={() => toggleSort("pack")}
                    >
                      {t.colPack}
                      {sortMark("pack")}
                    </button>
                  </th>
                  <th className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:text-zinc-900"
                      onClick={() => toggleSort("produce")}
                    >
                      {t.colProduce}
                      {sortMark("produce")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && !board ? (
                  <tr>
                    <td className="px-3 py-6 text-zinc-500" colSpan={6}>
                      {strings.common.loading}
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-zinc-500" colSpan={6}>
                      {(board?.rows.length ?? 0) > 0 ? t.noMatches : t.empty}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <BoardRow
                      key={row.productId}
                      row={row}
                      warehouseName={warehouseName}
                      stockWarehouseIds={stockWarehouseIds}
                      packWarehouseIds={packWarehouseIds}
                      activeQty={activeQty}
                      onSelectQty={setActiveQty}
                      onAdd={(next) => openConfirm(next)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <section id="planning-requests" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <RequestsPanel
            key={`${requestsKey}-${mainTab}-${focusRequestId ?? ""}`}
            forcedKind={mainTab === "pack" ? "pack" : "factory"}
            focusId={focusRequestId}
            onError={(msg) => setError(msg)}
          />
        </section>
      )}

      {pending ? (
        <ConfirmDialog
          pending={pending}
          qty={confirmQty}
          submitting={submitting}
          onQtyChange={setConfirmQty}
          onCancel={() => setPending(null)}
          onConfirm={() => void submitRequest()}
        />
      ) : null}
    </div>
  );
}

function QtyAction({
  id: _id,
  active,
  qty,
  label,
  accentClass,
  title,
  allowAdd = true,
  onSelect,
  onAdd,
}: {
  id: string;
  active: boolean;
  qty: number;
  label: string;
  accentClass: string;
  title?: string;
  allowAdd?: boolean;
  onSelect: () => void;
  onAdd: () => void;
}) {
  const t = strings.planning.kitBoard;
  if (!(qty > 0)) {
    return <span className="text-zinc-400">—</span>;
  }
  const canAdd = allowAdd && active;
  return (
    <div className="inline-flex flex-col items-start gap-1" title={title}>
      <button
        type="button"
        onClick={onSelect}
        disabled={!allowAdd}
        className={`tabular-nums ${accentClass} ${
          allowAdd ? (active ? "underline decoration-2 underline-offset-2" : "hover:underline") : "cursor-default"
        }`}
      >
        <span className="font-semibold">{qty}</span>
        {label ? <span className="ml-1 text-[11px] font-normal text-zinc-500">{label}</span> : null}
      </button>
      {canAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-sm font-bold text-white shadow hover:bg-cyan-700"
          title={t.addToRequestAction}
          aria-label={t.addToRequestAction}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

function BoardRow({
  row,
  warehouseName,
  stockWarehouseIds,
  packWarehouseIds,
  activeQty,
  onSelectQty,
  onAdd,
}: {
  row: KitBoardRow;
  warehouseName: Map<string, string>;
  stockWarehouseIds: Set<string> | null;
  packWarehouseIds: Set<string> | null;
  activeQty: string | null;
  onSelectQty: (id: string | null) => void;
  onAdd: (pending: PendingAdd) => void;
}) {
  const t = strings.planning.kitBoard;
  const badge = t.classBadge(row.paretoClass, row.xyzClass);
  const stockIds = stockWarehouseIds;
  const stockTip = stockTitle(
    stockIds
      ? Object.fromEntries(
          Object.entries(row.qtyByWarehouse).filter(([id]) => stockIds.has(id)),
        )
      : row.qtyByWarehouse,
    warehouseName,
  );
  const betterId = `${row.productId}:better`;
  const canId = `${row.productId}:can`;
  const produceId = `${row.productId}:produce`;
  const alreadyInRequest = row.alreadyInRequest ?? 0;

  return (
    <tr className={`border-b border-zinc-100 align-top ${toneClass(row.tone)}`}>
      <td className={`sticky left-0 z-10 px-3 py-2 ${toneClass(row.tone) || "bg-white"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-zinc-900">{row.sku}</span>
          <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-700">
            {badge}
          </span>
          {alreadyInRequest > 0 ? (
            <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-800">
              {t.inRequest(alreadyInRequest)}
            </span>
          ) : null}
        </div>
        <span className="mt-0.5 block text-xs text-zinc-500">{row.name}</span>
        {row.system ? (
          <span className="mt-1 block text-[11px] text-zinc-400">{row.system}</span>
        ) : null}
      </td>
      <td className="px-3 py-2 tabular-nums" title={stockTip || undefined}>
        <span className="font-medium text-zinc-900">
          {row.qtyStockTotal ?? row.qtyTotal}
        </span>
        {(row.qtyStockTotal ?? row.qtyTotal) < row.qtyTotal ? (
          <span className="mt-0.5 block text-[11px] text-zinc-400">
            {t.allWarehouses}: {row.qtyTotal}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {row.parts.length === 0 ? (
          <span className="text-xs text-zinc-400">{t.noParts}</span>
        ) : (
          <ul className="space-y-1.5">
            {row.parts.map((part) => (
              <li key={part.productId} className="text-xs leading-snug text-zinc-800">
                <span className="font-medium">{part.sku}</span>
                <span className="ml-1 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-semibold text-zinc-600">
                  {t.classBadge(part.paretoClass, part.xyzClass)}
                </span>
                <span className="ml-1 text-zinc-400">×{part.qtyPerKit}</span>
                {!part.constrains ? (
                  <span className="ml-1 text-zinc-400">({t.packaging})</span>
                ) : null}
                <span className="mt-0.5 block text-[11px] text-zinc-500">
                  {partStockLine(part, warehouseName, packWarehouseIds)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums">
        <span>{formatAvg(row.avgMonthlySold)}</span>
        {row.need > 0 ? (
          <span className="mt-0.5 block text-[11px] text-zinc-500">{t.needHint(row.need)}</span>
        ) : null}
      </td>
      <td className="px-3 py-2">
        {row.toPack > 0 ||
        row.canAssembleRemaining > 0 ||
        row.canAssemble > 0 ||
        alreadyInRequest > 0 ? (
          <div className="flex flex-col gap-2">
            {alreadyInRequest > 0 ? (
              <span className="text-[11px] font-medium text-cyan-800">
                {t.inRequest(alreadyInRequest)}
              </span>
            ) : null}
            <QtyAction
              id={betterId}
              active={activeQty === betterId}
              qty={row.toPack}
              label={t.packBetter}
              accentClass="text-emerald-800"
              allowAdd={row.toPack > 0}
              onSelect={() => onSelectQty(activeQty === betterId ? null : betterId)}
              onAdd={() =>
                onAdd({
                  kind: "pack",
                  row,
                  defaultQty: row.toPack,
                  source: "better",
                })
              }
            />
            <QtyAction
              id={canId}
              active={activeQty === canId}
              qty={
                (row.canAssembleRemaining ?? row.canAssemble) > 0
                  ? (row.canAssembleRemaining ?? row.canAssemble)
                  : row.canAssemble
              }
              label={t.packCan}
              accentClass="text-zinc-700"
              title={
                row.canAssembleRemaining != null &&
                row.canAssemble !== row.canAssembleRemaining
                  ? t.packCanPhysical(row.canAssemble)
                  : undefined
              }
              // Only add when there is a sales gap — packing with need=0 inflates GP.
              allowAdd={row.toPack > 0 && (row.canAssembleRemaining ?? row.canAssemble) > 0}
              onSelect={() => onSelectQty(activeQty === canId ? null : canId)}
              onAdd={() =>
                onAdd({
                  kind: "pack",
                  row,
                  defaultQty: Math.min(
                    row.canAssembleRemaining ?? row.canAssemble,
                    row.toPack || Math.max(0, row.need - alreadyInRequest),
                  ),
                  source: "can",
                })
              }
            />
          </div>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <QtyAction
          id={produceId}
          active={activeQty === produceId}
          qty={row.toProduce}
          label=""
          accentClass="text-amber-900"
          onSelect={() => onSelectQty(activeQty === produceId ? null : produceId)}
          onAdd={() =>
            onAdd({
              kind: "produce",
              row,
              defaultQty: row.toProduce,
              source: "produce",
            })
          }
        />
      </td>
    </tr>
  );
}

function ConfirmDialog({
  pending,
  qty,
  submitting,
  onQtyChange,
  onCancel,
  onConfirm,
}: {
  pending: PendingAdd;
  qty: string;
  submitting: boolean;
  onQtyChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = strings.planning.kitBoard;
  const isPack = pending.kind === "pack";
  const title = isPack ? t.confirmPackTitle : t.confirmProduceTitle;
  const partsHint =
    !isPack && pending.row.parts.some((p) => p.constrains)
      ? t.confirmProduceParts(
          pending.row.parts
            .filter((p) => p.constrains)
            .map((p) => p.sku)
            .slice(0, 6)
            .join(", "),
        )
      : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submitting]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!submitting) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
        <p className="mt-2 text-sm text-zinc-600">
          {pending.row.sku} · {pending.row.name}
        </p>
        {isPack && (pending.row.alreadyInRequest ?? 0) > 0 ? (
          <p className="mt-1 text-xs font-medium text-cyan-800">
            {t.confirmAlreadyInRequest(pending.row.alreadyInRequest ?? 0)}
          </p>
        ) : null}
        {partsHint ? <p className="mt-1 text-xs text-zinc-500">{partsHint}</p> : null}
        <label className="mt-4 block text-sm text-zinc-700">
          {t.confirmQtyLabel}
          <input
            type="number"
            min={1}
            step={1}
            value={qty}
            onChange={(e) => onQtyChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
            autoFocus
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
          >
            {submitting ? t.adding : t.confirmAdd}
          </button>
        </div>
      </div>
    </div>
  );
}
