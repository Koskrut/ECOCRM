"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { planningApi, type KitBomListItem } from "@/lib/api/resources/planning";

type SortKey =
  | "sku"
  | "name"
  | "class"
  | "qty"
  | "ideal"
  | "stock"
  | "canPackNow"
  | "toWork"
  | "maxBuildNow"
  | "weeksOfCover"
  | "price"
  | "revision"
  | "linesCount"
  | "effectiveFrom";

type SortDir = "asc" | "desc";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toggleClass<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function classSortValue(row: KitBomListItem): string {
  return `${row.paretoClass}${row.xyzClass ?? ""}`;
}

function compareRows(a: KitBomListItem, b: KitBomListItem, key: SortKey, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  const num = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? null : x);
  let cmp = 0;
  switch (key) {
    case "sku":
      cmp = a.sku.localeCompare(b.sku, "uk");
      break;
    case "name":
      cmp = a.name.localeCompare(b.name, "uk");
      break;
    case "class":
      cmp = classSortValue(a).localeCompare(classSortValue(b));
      break;
    case "qty":
      cmp = a.targetStock - b.targetStock;
      break;
    case "ideal":
      cmp = a.coverTarget - b.coverTarget;
      break;
    case "stock":
      cmp = a.stockFinished - b.stockFinished;
      break;
    case "canPackNow":
      cmp = a.canPackNow - b.canPackNow;
      break;
    case "toWork":
      cmp = a.toWork - b.toWork;
      break;
    case "maxBuildNow":
      cmp = a.maxBuildNow - b.maxBuildNow;
      break;
    case "weeksOfCover": {
      const aw = num(a.weeksOfCover);
      const bw = num(b.weeksOfCover);
      if (aw == null && bw == null) cmp = 0;
      else if (aw == null) cmp = 1;
      else if (bw == null) cmp = -1;
      else cmp = aw - bw;
      break;
    }
    case "price":
      cmp = a.basePrice - b.basePrice;
      break;
    case "revision":
      cmp = (a.revision ?? -1) - (b.revision ?? -1);
      break;
    case "linesCount":
      cmp = a.linesCount - b.linesCount;
      break;
    case "effectiveFrom": {
      const at = a.effectiveFrom ? Date.parse(a.effectiveFrom) : 0;
      const bt = b.effectiveFrom ? Date.parse(b.effectiveFrom) : 0;
      cmp = at - bt;
      break;
    }
    default:
      cmp = 0;
  }
  if (cmp !== 0) return cmp * mul;
  return a.sku.localeCompare(b.sku, "uk") * mul;
}

export function KitBomsPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const kb = t.kitBoms;
  const board = t.kitBoard;
  const [rows, setRows] = useState<KitBomListItem[]>([]);
  const [query, setQuery] = useState("");
  const [abcFilter, setAbcFilter] = useState<Array<"A" | "B" | "C">>([]);
  const [xyzFilter, setXyzFilter] = useState<Array<"X" | "Y" | "Z">>([]);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setRows(await planningApi.listBoms());
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.loadBoms);
    } finally {
      setBusy(false);
    }
  }, [onError, t.errors.loadBoms]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q),
      );
    }
    if (abcFilter.length > 0) {
      const set = new Set(abcFilter);
      list = list.filter((r) => set.has(r.paretoClass));
    }
    if (xyzFilter.length > 0) {
      const set = new Set(xyzFilter);
      list = list.filter((r) => r.xyzClass != null && set.has(r.xyzClass));
    }
    return [...list].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, query, abcFilter, xyzFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "sku" || key === "name" || key === "class" ? "asc" : "desc");
    }
  };

  const sortMark = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const exportCsv = () => {
    const header = [
      "kitSku",
      "kitName",
      "paretoClass",
      "xyzClass",
      "targetStock",
      "coverTarget",
      "stockFinished",
      "canPackNow",
      "toWork",
      "maxBuildNow",
      "weeksOfCover",
      "weeklyPackNeed",
      "componentSku",
      "componentName",
      "qtyPerKit",
      "scrapPct",
      "componentAvailable",
      "revision",
    ].join(",");
    const body = visible
      .flatMap((kit) => {
        const kitCells = [
          csvCell(kit.sku),
          csvCell(kit.name),
          csvCell(kit.paretoClass),
          csvCell(kit.xyzClass),
          csvCell(kit.targetStock),
          csvCell(kit.coverTarget),
          csvCell(kit.stockFinished),
          csvCell(kit.canPackNow),
          csvCell(kit.toWork),
          csvCell(kit.maxBuildNow),
          csvCell(kit.weeksOfCover),
          csvCell(kit.weeklyPackNeed),
        ];
        if (kit.lines.length === 0) {
          return [[...kitCells, "", "", "", "", "", csvCell(kit.revision)].join(",")];
        }
        return kit.lines.map((line) =>
          [
            ...kitCells,
            csvCell(line.componentSku),
            csvCell(line.componentName),
            csvCell(line.qtyPerKit),
            csvCell(line.scrapPct),
            csvCell(line.available),
            csvCell(kit.revision),
          ].join(","),
        );
      })
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kit-boms.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const coverClass = (tone: KitBomListItem["coverTone"]) =>
    tone === "critical" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-zinc-800";

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "sku", label: t.labels.sku },
    { key: "name", label: t.labels.name },
    { key: "class", label: kb.classCol },
    { key: "qty", label: kb.qtyCol },
    { key: "ideal", label: kb.idealCol },
    { key: "stock", label: kb.stockCol },
    { key: "canPackNow", label: t.labels.canPackNow },
    { key: "toWork", label: t.labels.toWork },
    { key: "maxBuildNow", label: t.labels.maxBuildNow },
    { key: "weeksOfCover", label: kb.weeksCover },
    { key: "price", label: kb.priceCol },
    { key: "revision", label: t.labels.revision },
    { key: "linesCount", label: kb.linesCount },
    { key: "effectiveFrom", label: kb.effectiveFrom },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">{kb.hint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={board.search}
          className="w-56 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
        />
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {board.filterAbc}
        </span>
        {(["A", "B", "C"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setAbcFilter((prev) => toggleClass(prev, c))}
            className={
              abcFilter.includes(c)
                ? "rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-white"
                : "rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700"
            }
          >
            {c}
          </button>
        ))}
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          {board.filterXyz}
        </span>
        {(["X", "Y", "Z"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setXyzFilter((prev) => toggleClass(prev, c))}
            className={
              xyzFilter.includes(c)
                ? "rounded-full bg-zinc-900 px-2.5 py-1 text-xs text-white"
                : "rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700"
            }
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
          onClick={() => void load()}
        >
          {t.actions.refresh}
        </button>
        <button
          type="button"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm"
          onClick={exportCsv}
          disabled={visible.length === 0}
        >
          {t.actions.exportCsv}
        </button>
        <span className="text-xs text-zinc-500">{board.count(visible.length)}</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="whitespace-nowrap px-2 py-2 text-left font-medium text-zinc-600">
                  <button
                    type="button"
                    className="inline-flex items-center hover:text-zinc-900"
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    <span className="text-zinc-400">{sortMark(col.key)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-zinc-500">
                  {busy ? strings.common.loading : t.states.none}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const open = expandedId === row.kitProductId;
                const classHint =
                  row.paretoClass === "A" && row.xyzClass === "X"
                    ? board.classHintAx
                    : row.paretoClass === "A" && row.xyzClass === "Z"
                      ? board.classHintAz
                      : null;
                return (
                  <Fragment key={row.kitProductId}>
                    <tr
                      className="cursor-pointer hover:bg-zinc-50"
                      onClick={() => setExpandedId(open ? null : row.kitProductId)}
                    >
                      <td className="whitespace-nowrap px-2 py-1.5 font-medium text-zinc-900">
                        <span className="mr-1 text-zinc-400">{open ? "▾" : "▸"}</span>
                        {row.sku}
                      </td>
                      <td className="max-w-[14rem] truncate px-2 py-1.5 text-zinc-800" title={row.name}>
                        {row.name}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-800">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium">
                          {board.classBadge(row.paretoClass, row.xyzClass)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.targetStock}</td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.coverTarget}</td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.stockFinished}</td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.canPackNow > 0 ? "font-medium text-cyan-700" : "text-zinc-800"}`}
                      >
                        {row.canPackNow}
                      </td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.toWork > 0 ? "font-medium text-rose-700" : "text-zinc-800"}`}
                      >
                        {row.toWork}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.maxBuildNow}</td>
                      <td className={`px-2 py-1.5 tabular-nums ${coverClass(row.coverTone)}`}>
                        {row.weeksOfCover == null
                          ? board.weeksUnknown
                          : `${row.weeksOfCover} ${board.weeksUnit}`}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">
                        {row.basePrice.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">
                        {row.revision ?? "—"}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">{row.linesCount}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600">
                        {row.effectiveFrom
                          ? new Date(row.effectiveFrom).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-zinc-50/80">
                        <td colSpan={columns.length} className="px-4 py-3">
                          {classHint ? (
                            <p className="mb-2 text-xs text-zinc-600">{classHint}</p>
                          ) : null}
                          {row.bottleneckSku ? (
                            <p className="mb-2 text-xs text-amber-800">
                              {t.labels.bottleneck}: {row.bottleneckSku}
                              {row.bottleneckName ? ` · ${row.bottleneckName}` : ""}
                            </p>
                          ) : null}
                          {row.waitingOrders > 0 ? (
                            <p className="mb-2 text-xs text-zinc-600">
                              {board.waiting(row.waitingOrders)}
                            </p>
                          ) : null}
                          {row.lines.length === 0 ? (
                            <p className="text-xs text-zinc-500">{t.states.noBom}</p>
                          ) : (
                            <table className="min-w-full divide-y divide-zinc-200 text-xs">
                              <thead>
                                <tr className="text-left text-zinc-500">
                                  <th className="py-1 pr-3 font-medium">{t.labels.component}</th>
                                  <th className="py-1 pr-3 font-medium">{t.labels.qty}</th>
                                  <th className="py-1 pr-3 font-medium">{kb.scrap}</th>
                                  <th className="py-1 pr-3 font-medium">{t.labels.available}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {row.lines.map((line) => (
                                  <tr
                                    key={line.componentProductId}
                                    className={
                                      line.isBottleneck ? "bg-amber-50 text-amber-950" : ""
                                    }
                                  >
                                    <td className="py-1 pr-3">
                                      <span className="font-medium">{line.componentSku}</span>
                                      <span className="ml-1 text-zinc-500">
                                        {line.componentName}
                                      </span>
                                      {line.isBottleneck ? (
                                        <span className="ml-1 rounded bg-amber-200 px-1 text-[10px] font-semibold uppercase">
                                          {t.labels.bottleneck}
                                        </span>
                                      ) : null}
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums">{line.qtyPerKit}</td>
                                    <td className="py-1 pr-3 tabular-nums">
                                      {line.scrapPct == null ? "—" : `${line.scrapPct}%`}
                                    </td>
                                    <td className="py-1 pr-3 tabular-nums">{line.available}</td>
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
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
