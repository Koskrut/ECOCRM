"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { apiHttp } from "@/lib/api/client";
import {
  planningApi,
  resolvePlanningUploadError,
  type KitBoardRow,
  type KitBoardTone,
  type KitBoardView,
} from "@/lib/api/resources/planning";

const UNASSIGNED_WAREHOUSE_ID = "__unassigned__";

type Filter = "all" | "pack" | "missing";

function warehouseLabel(id: string, name: string): string {
  if (id === UNASSIGNED_WAREHOUSE_ID) return strings.planning.kitBoard.unassigned;
  return name;
}

function qtyText(value: number): string {
  return value > 0 ? String(value) : "—";
}

function toneClass(tone: KitBoardTone): string {
  if (tone === "pack") return "bg-emerald-50";
  if (tone === "missing_parts" || tone === "parts_shared") return "bg-amber-50";
  return "";
}

function toneLabel(tone: KitBoardTone): string {
  const t = strings.planning.kitBoard;
  if (tone === "pack") return t.tonePack;
  if (tone === "enough") return t.toneEnough;
  if (tone === "missing_parts") return t.toneMissing;
  if (tone === "parts_shared") return t.toneShared;
  return t.toneNoSales;
}

function formatAvg(value: number): string {
  if (!(value > 0)) return "—";
  return value.toLocaleString("uk-UA", { maximumFractionDigits: 1 });
}

export function KitBoardPanel() {
  const t = strings.planning.kitBoard;
  const [coverMonths, setCoverMonths] = useState(1);
  const [board, setBoard] = useState<KitBoardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    planningApi
      .getKitBoard(coverMonths)
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
  }, [coverMonths, refreshKey, t.loadError]);

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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (board?.rows ?? []).filter((row) => {
      if (filter === "pack" && row.tone !== "pack") return false;
      if (filter === "missing" && row.tone !== "missing_parts" && row.tone !== "parts_shared") {
        return false;
      }
      if (!q) return true;
      const hay = [row.sku, row.name, ...row.parts.flatMap((part) => [part.sku, part.name])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [board, filter, query]);

  const packCount = (board?.rows ?? []).filter((row) => row.tone === "pack").length;
  const warehouses = board?.warehouses ?? [];

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
          {t.packCount(packCount)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">{t.cover}</span>
          {[1, 2, 3].map((months) => (
            <button
              key={months}
              type="button"
              onClick={() => setCoverMonths(months)}
              className={
                coverMonths === months
                  ? "rounded-full bg-cyan-600 px-3 py-1 text-xs font-medium text-white"
                  : "rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-700"
              }
            >
              {t.monthShort(months)}
            </button>
          ))}
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

      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          className="w-full max-w-sm rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        {(
          [
            ["all", t.filterAll],
            ["pack", t.filterPack],
            ["missing", t.filterMissing],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={
              filter === key
                ? "rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                : "rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700"
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-600">
              <th className="sticky left-0 z-20 bg-zinc-50 px-3 py-2">{t.colKit}</th>
              {warehouses.map((warehouse) => (
                <th key={warehouse.id} className="px-3 py-2 whitespace-nowrap">
                  {warehouseLabel(warehouse.id, warehouse.name)}
                </th>
              ))}
              <th className="px-3 py-2">{t.colTotal}</th>
              <th className="px-3 py-2">{t.colSales}</th>
              <th className="px-3 py-2">{t.colNeed}</th>
              <th className="px-3 py-2">{t.colCan}</th>
              <th className="px-3 py-2">{t.colPack}</th>
            </tr>
          </thead>
          <tbody>
            {loading && !board ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={6 + warehouses.length}>
                  {strings.common.loading}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={6 + warehouses.length}>
                  {(board?.rows.length ?? 0) > 0 ? t.noMatches : t.empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <BoardRow
                  key={row.productId}
                  row={row}
                  warehouses={warehouses}
                  open={openId === row.productId}
                  warehouseName={warehouseName}
                  onToggle={() => setOpenId(openId === row.productId ? null : row.productId)}
                />
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
  warehouses,
  open,
  warehouseName,
  onToggle,
}: {
  row: KitBoardRow;
  warehouses: Array<{ id: string; name: string }>;
  open: boolean;
  warehouseName: Map<string, string>;
  onToggle: () => void;
}) {
  const t = strings.planning.kitBoard;
  const where = row.canAssembleWarehouseId
    ? warehouseName.get(row.canAssembleWarehouseId)
    : null;
  const packWhere = row.toPackWarehouseId ? warehouseName.get(row.toPackWarehouseId) : null;
  const colSpan = 6 + warehouses.length;

  return (
    <Fragment>
      <tr className={`border-b border-zinc-100 ${toneClass(row.tone)}`}>
        <td className={`sticky left-0 z-10 px-3 py-2 ${toneClass(row.tone) || "bg-white"}`}>
          <button type="button" className="text-left" onClick={onToggle}>
            <span className="font-medium text-zinc-900">{row.sku}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{row.name}</span>
            <span className="mt-1 inline-flex rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-zinc-600">
              {toneLabel(row.tone)}
            </span>
          </button>
        </td>
        {warehouses.map((warehouse) => (
          <td key={warehouse.id} className="px-3 py-2 tabular-nums text-zinc-800">
            {qtyText(row.qtyByWarehouse[warehouse.id] ?? 0)}
          </td>
        ))}
        <td className="px-3 py-2 font-medium tabular-nums">{row.qtyTotal}</td>
        <td className="px-3 py-2 tabular-nums">{formatAvg(row.avgMonthlySold)}</td>
        <td className="px-3 py-2 tabular-nums">{row.need > 0 ? row.need : "—"}</td>
        <td className="px-3 py-2 tabular-nums">
          {row.canAssemble > 0 ? row.canAssemble : "—"}
          {where ? <span className="mt-0.5 block text-[11px] text-zinc-500">{where}</span> : null}
        </td>
        <td className="px-3 py-2 font-semibold tabular-nums text-emerald-800">
          {row.toPack > 0 ? row.toPack : "—"}
          {packWhere && row.toPack > 0 ? (
            <span className="mt-0.5 block text-[11px] font-normal text-zinc-500">{packWhere}</span>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr className="border-b border-zinc-100 bg-zinc-50/80">
          <td colSpan={colSpan} className="px-3 py-3">
            {row.parts.length === 0 ? (
              <p className="text-sm text-zinc-500">{t.noParts}</p>
            ) : (
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="px-2 py-1 font-medium">{t.colPart}</th>
                    <th className="px-2 py-1 font-medium">{t.perKit}</th>
                    {warehouses.map((warehouse) => (
                      <th key={warehouse.id} className="px-2 py-1 font-medium whitespace-nowrap">
                        {warehouseLabel(warehouse.id, warehouse.name)}
                      </th>
                    ))}
                    <th className="px-2 py-1 font-medium">{t.colTotal}</th>
                  </tr>
                </thead>
                <tbody>
                  {row.parts.map((part) => (
                    <tr key={part.productId} className="border-t border-zinc-200">
                      <td className="px-2 py-1">
                        <span className="font-medium text-zinc-800">{part.sku}</span>
                        <span className="ml-2 text-zinc-500">{part.name}</span>
                        {!part.constrains ? (
                          <span className="ml-2 text-zinc-400">{t.packaging}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1 tabular-nums">{part.qtyPerKit}</td>
                      {warehouses.map((warehouse) => (
                        <td key={warehouse.id} className="px-2 py-1 tabular-nums">
                          {qtyText(part.qtyByWarehouse[warehouse.id] ?? 0)}
                        </td>
                      ))}
                      <td className="px-2 py-1 tabular-nums">{part.qtyTotal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}
