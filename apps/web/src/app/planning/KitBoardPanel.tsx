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

const UNASSIGNED_WAREHOUSE_ID = "__unassigned__";
const NO_CATEGORY = "__none__";

type AttentionFilter = "all" | "attention";

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
): string {
  const bits = Object.entries(part.qtyByWarehouse)
    .filter(([, qty]) => qty > 0)
    .map(([id, qty]) => {
      const name = warehouseName.get(id) ?? id;
      const short = name.replace(/^(\d+\s+)?Склад\s+/i, "").slice(0, 24);
      return `${short} ${qty}`;
    });
  return bits.length > 0 ? bits.join(" · ") : "—";
}

export function KitBoardPanel() {
  const t = strings.planning.kitBoard;
  const [board, setBoard] = useState<KitBoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [attention, setAttention] = useState<AttentionFilter>("all");
  const [system, setSystem] = useState("");
  const [category, setCategory] = useState("");
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

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
    return (board?.rows ?? []).filter((row) => {
      if (attention === "attention" && !(row.toPack > 0 || row.toProduce > 0)) return false;
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
  }, [attention, board, category, query, system]);

  const attentionCount = (board?.rows ?? []).filter(
    (row) => row.toPack > 0 || row.toProduce > 0,
  ).length;

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

  return (
    <div className="space-y-4">
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
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800">
          {t.packCount(attentionCount)}
        </span>
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

      <p className="text-sm text-zinc-500">{t.sharedHint}</p>
      {uploadNote ? <p className="text-sm text-cyan-800">{uploadNote}</p> : null}
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

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
            onClick={() => setAttention(key)}
            className={
              attention === key
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
            }
          >
            {label}
          </button>
        ))}
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
              <th className="sticky left-0 z-20 bg-zinc-50 px-3 py-2">{t.colKit}</th>
              <th className="px-3 py-2">{t.colStock}</th>
              <th className="min-w-[18rem] px-3 py-2">{t.colParts}</th>
              <th className="px-3 py-2">{t.colSales}</th>
              <th className="px-3 py-2">{t.colPack}</th>
              <th className="px-3 py-2">{t.colProduce}</th>
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
                <BoardRow key={row.productId} row={row} warehouseName={warehouseName} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BoardRow({
  row,
  warehouseName,
}: {
  row: KitBoardRow;
  warehouseName: Map<string, string>;
}) {
  const t = strings.planning.kitBoard;
  const badge = t.classBadge(row.paretoClass, row.xyzClass);
  const stockTip = stockTitle(row.qtyByWarehouse, warehouseName);

  return (
    <tr className={`border-b border-zinc-100 align-top ${toneClass(row.tone)}`}>
      <td className={`sticky left-0 z-10 px-3 py-2 ${toneClass(row.tone) || "bg-white"}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-zinc-900">{row.sku}</span>
          <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-700">
            {badge}
          </span>
        </div>
        <span className="mt-0.5 block text-xs text-zinc-500">{row.name}</span>
        {row.system ? (
          <span className="mt-1 block text-[11px] text-zinc-400">{row.system}</span>
        ) : null}
      </td>
      <td className="px-3 py-2 tabular-nums" title={stockTip || undefined}>
        <span className="font-medium text-zinc-900">{row.qtyTotal}</span>
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
                  {partStockLine(part, warehouseName)}
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
      <td className="px-3 py-2 font-semibold tabular-nums text-emerald-800">
        {row.toPack > 0 ? row.toPack : "—"}
      </td>
      <td className="px-3 py-2 font-semibold tabular-nums text-amber-900">
        {row.toProduce > 0 ? row.toProduce : "—"}
      </td>
    </tr>
  );
}
