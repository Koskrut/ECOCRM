"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { planningApi, type KitBomListItem } from "@/lib/api/resources/planning";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toggleClass<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
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
    return list;
  }, [rows, query, abcFilter, xyzFilter]);

  const exportCsv = () => {
    const header = [
      "kitSku",
      "kitName",
      "paretoClass",
      "xyzClass",
      "stockFinished",
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
        if (kit.lines.length === 0) {
          return [
            [
              csvCell(kit.sku),
              csvCell(kit.name),
              csvCell(kit.paretoClass),
              csvCell(kit.xyzClass),
              csvCell(kit.stockFinished),
              csvCell(kit.maxBuildNow),
              csvCell(kit.weeksOfCover),
              csvCell(kit.weeklyPackNeed),
              "",
              "",
              "",
              "",
              "",
              csvCell(kit.revision),
            ].join(","),
          ];
        }
        return kit.lines.map((line) =>
          [
            csvCell(kit.sku),
            csvCell(kit.name),
            csvCell(kit.paretoClass),
            csvCell(kit.xyzClass),
            csvCell(kit.stockFinished),
            csvCell(kit.maxBuildNow),
            csvCell(kit.weeksOfCover),
            csvCell(kit.weeklyPackNeed),
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

      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        <table className="min-w-full divide-y divide-zinc-200 text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {[
                t.labels.sku,
                t.labels.name,
                kb.classCol,
                kb.stockFinished,
                t.labels.maxBuildNow,
                kb.weeksCover,
                kb.cycleNeed,
                kb.priceCol,
                t.labels.revision,
                kb.linesCount,
                kb.effectiveFrom,
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-2 text-left font-medium text-zinc-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-4 text-zinc-500">
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
                      onClick={() =>
                        setExpandedId(open ? null : row.kitProductId)
                      }
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
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.stockFinished}</td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.maxBuildNow}</td>
                      <td className={`px-2 py-1.5 tabular-nums ${coverClass(row.coverTone)}`}>
                        {row.weeksOfCover == null
                          ? board.weeksUnknown
                          : `${row.weeksOfCover} ${board.weeksUnit}`}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">
                        {row.weeklyPackNeed}
                        {row.hardNeed > 0 ? (
                          <span className="ml-1 text-xs text-zinc-400">
                            ({t.labels.hardShort}:{row.hardNeed})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">
                        {row.basePrice.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">{row.revision}</td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">{row.linesCount}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-zinc-600">
                        {new Date(row.effectiveFrom).toLocaleDateString()}
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-zinc-50/80">
                        <td colSpan={11} className="px-4 py-3">
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
                                  className={line.isBottleneck ? "bg-amber-50 text-amber-950" : ""}
                                >
                                  <td className="py-1 pr-3">
                                    <span className="font-medium">{line.componentSku}</span>
                                    <span className="ml-1 text-zinc-500">{line.componentName}</span>
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
