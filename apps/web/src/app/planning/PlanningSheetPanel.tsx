"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { planningApi, type KitBomListItem, type KitBomListLine } from "@/lib/api/resources/planning";

type AbcFilter = "A" | "B" | "C";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isPackagingLine(line: KitBomListLine): boolean {
  return /^PKG[:-]/i.test(line.componentSku.trim());
}

function partLines(row: KitBomListItem): KitBomListLine[] {
  return row.lines.filter((l) => !l.isFastener && !isPackagingLine(l));
}

function fastenerLines(lines: KitBomListLine[]): KitBomListLine[] {
  return lines.filter((l) => l.isFastener);
}

function hasAction(row: KitBomListItem): boolean {
  const rem = row.remainingPackIdeal ?? Math.max(0, row.canPackNow - (row.alreadyInRequest ?? 0));
  return rem > 0 || row.toWorkLot > 0 || row.toWork > 0;
}

function dash(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(n);
}

function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

function coverClass(months: number | null | undefined): string {
  if (months == null) return "text-zinc-400";
  if (months < 1) return "bg-rose-50 text-rose-800";
  if (months < 3) return "bg-amber-50 text-amber-900";
  return "bg-emerald-50 text-emerald-900";
}

function batchCodeFor(sku: string): string {
  const slug = sku.replace(/[^A-Za-z0-9]+/g, "").slice(0, 10) || "KIT";
  return `PB-${slug}-${Date.now().toString(36).toUpperCase()}`;
}

type Props = {
  onError: (message: string) => void;
};

export function PlanningSheetPanel({ onError }: Props) {
  const t = strings.planning;
  const sh = t.sheet;

  const [rows, setRows] = useState<KitBomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [abcFilter, setAbcFilter] = useState<AbcFilter[]>([]);
  const [onlyAction, setOnlyAction] = useState(false);
  const [onlyTop80, setOnlyTop80] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [packDraft, setPackDraft] = useState<Record<string, string>>({});
  const [produceDraft, setProduceDraft] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await planningApi.listBoms();
      setRows(list);
      setPackDraft((prev) => {
        const next = { ...prev };
        for (const row of list) {
          if (next[row.kitProductId] == null) {
            const rem =
              row.remainingPackIdeal ?? Math.max(0, row.canPackNow - (row.alreadyInRequest ?? 0));
            if (rem > 0) next[row.kitProductId] = String(rem);
          }
        }
        return next;
      });
      setProduceDraft((prev) => {
        const next = { ...prev };
        for (const row of list) {
          if (next[row.kitProductId] == null && row.toWorkLot > 0) {
            next[row.kitProductId] = String(row.toWorkLot);
          }
        }
        return next;
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.loadBoms);
    } finally {
      setLoading(false);
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
        (r) =>
          r.sku.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.lines.some(
            (l) =>
              l.componentSku.toLowerCase().includes(q) ||
              l.componentName.toLowerCase().includes(q),
          ),
      );
    }
    if (abcFilter.length > 0) {
      const set = new Set(abcFilter);
      list = list.filter((r) => set.has(r.paretoClass));
    }
    if (onlyTop80) {
      list = list.filter((r) => r.paretoClass === "A");
    }
    if (onlyAction) {
      list = list.filter(hasAction);
    }
    return [...list].sort((a, b) => {
      const abc = a.paretoClass.localeCompare(b.paretoClass);
      if (abc !== 0) return abc;
      return a.sku.localeCompare(b.sku, "uk");
    });
  }, [rows, query, abcFilter, onlyTop80, onlyAction]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAbc = (c: AbcFilter) => {
    setAbcFilter((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const setPackQty = async (row: KitBomListItem, qty: number) => {
    if (!(qty > 0) || qty < row.minPackLot) {
      onError(t.kitBoms.belowMinPack(row.minPackLot));
      return;
    }
    setActingId(row.kitProductId);
    try {
      let list = (await planningApi.listPackingLists(5))[0] ?? null;
      if (list?.status === "APPROVED") {
        list = await planningApi.reopenPackingList(list.id);
      }
      if (!list || list.status !== "DRAFT") {
        const proposed = await planningApi.proposePackingList();
        list = proposed.list;
      }
      if (!list || list.status !== "DRAFT") {
        onError(t.errors.packing);
        return;
      }
      await planningApi.setPackingKitQty(list.id, row.kitProductId, qty);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.packing);
    } finally {
      setActingId(null);
    }
  };

  const createProduceBatch = async (row: KitBomListItem, qty: number) => {
    if (!(qty > 0)) return;
    setActingId(row.kitProductId);
    try {
      await planningApi.createBatch({
        code: batchCodeFor(row.sku),
        productId: row.kitProductId,
        qtyPlanned: qty,
      });
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.createBatch);
    } finally {
      setActingId(null);
    }
  };

  const orderBottleneck = async (row: KitBomListItem) => {
    if (!row.bottleneckComponentId || row.suggestedFactoryQty <= 0) return;
    setActingId(row.kitProductId);
    try {
      const orders = await planningApi.listFactoryOrders(10);
      const draft = orders.find((o) => o.status === "DRAFT");
      if (draft) {
        await planningApi.addFactoryLine(draft.id, {
          partProductId: row.bottleneckComponentId,
          qtyOrdered: row.suggestedFactoryQty,
        });
      } else {
        await planningApi.createFactoryOrder({
          lines: [
            {
              partProductId: row.bottleneckComponentId,
              qtyOrdered: row.suggestedFactoryQty,
            },
          ],
        });
      }
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.factory);
    } finally {
      setActingId(null);
    }
  };

  const exportCsv = () => {
    const header = [
      "kitSku",
      "kitName",
      "stockFinished",
      "wipKits",
      "monthsOfCover",
      "monthsOfCover2m",
      "salesPerYear",
      "lineKind",
      "componentSku",
      "componentName",
      "qtyPerKit",
      "componentAvailable",
      "componentWip",
      "canPackNow",
      "toWorkLot",
      "alreadyInRequest",
    ].join(",");
    const body = visible
      .flatMap((kit) => {
        const salesYear =
          kit.avgMonthlySold > 0 ? Math.round(kit.avgMonthlySold * 12 * 100) / 100 : "";
        const kitCells = [
          csvCell(kit.sku),
          csvCell(kit.name),
          csvCell(kit.stockFinished),
          csvCell(kit.wipKits ?? 0),
          csvCell(kit.monthsOfCover),
          csvCell(kit.monthsOfCover2m),
          csvCell(salesYear),
        ];
        const lines = kit.lines.filter((l) => !isPackagingLine(l));
        if (lines.length === 0) {
          return [[...kitCells, "kit", "", "", "", "", "", csvCell(kit.canPackNow), csvCell(kit.toWorkLot), csvCell(kit.alreadyInRequest)].join(",")];
        }
        return lines.map((line) =>
          [
            ...kitCells,
            csvCell(line.isFastener ? "fastener" : "part"),
            csvCell(line.componentSku),
            csvCell(line.componentName),
            csvCell(line.qtyPerKit),
            csvCell(line.available),
            csvCell(line.wipQty ?? 0),
            csvCell(kit.canPackNow),
            csvCell(kit.toWorkLot),
            csvCell(kit.alreadyInRequest),
          ].join(","),
        );
      })
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "planning-sheet.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const chipClass = (on: boolean) =>
    on
      ? "rounded-md bg-zinc-900 px-2.5 py-1 text-xs text-white"
      : "rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700";

  const th =
    "sticky top-0 z-10 border-b border-zinc-200 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-600";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-zinc-600">{sh.hint}</p>
        <button
          type="button"
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
          onClick={exportCsv}
        >
          {t.actions.exportCsv}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={sh.searchPlaceholder}
          className="min-w-[14rem] flex-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-sm"
        />
        {(["A", "B", "C"] as const).map((c) => (
          <button key={c} type="button" className={chipClass(abcFilter.includes(c))} onClick={() => toggleAbc(c)}>
            {c}
          </button>
        ))}
        <button type="button" className={chipClass(onlyTop80)} onClick={() => setOnlyTop80((v) => !v)}>
          {sh.filterTop80}
        </button>
        <button type="button" className={chipClass(onlyAction)} onClick={() => setOnlyAction((v) => !v)}>
          {sh.filterAction}
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
          onClick={() => void load()}
        >
          {t.actions.refresh}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-zinc-500">{sh.empty}</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-[1100px] w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="bg-zinc-50">
                <th className={`${th} w-8 bg-zinc-50`} />
                <th className={`${th} bg-zinc-50`}>{sh.colSku}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colGp}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colWipKits}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colParts}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colPartStock}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colPartWip}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colFasteners}</th>
                <th className={`${th} bg-zinc-50`}>{sh.colQty}</th>
                <th className={`${th} bg-emerald-50/80 text-emerald-900`}>{sh.colCover2m}</th>
                <th className={`${th} bg-emerald-50/80 text-emerald-900`}>{sh.colCover}</th>
                <th className={`${th} bg-orange-50/70 text-orange-950`}>{sh.colSalesYear}</th>
                <th className={`${th} bg-emerald-50/80 text-emerald-900`}>{sh.colPack}</th>
                <th className={`${th} bg-emerald-50/80 text-emerald-900`}>{sh.colProduce}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const expanded = !collapsed.has(row.kitProductId);
                const parts = partLines(row);
                const fasteners = fastenerLines(row.lines);
                const salesYear =
                  row.avgMonthlySold > 0
                    ? Math.round(row.avgMonthlySold * 12 * 100) / 100
                    : null;
                const acting = actingId === row.kitProductId;
                const packVal = packDraft[row.kitProductId] ?? "";
                const produceVal = produceDraft[row.kitProductId] ?? "";

                return (
                  <Fragment key={row.kitProductId}>
                    <tr className="border-t border-zinc-200 bg-white hover:bg-zinc-50/80">
                      <td className="px-1 py-1 text-center">
                        <button
                          type="button"
                          className="h-6 w-6 rounded text-zinc-500 hover:bg-zinc-100"
                          onClick={() => toggleCollapse(row.kitProductId)}
                          aria-label={expanded ? sh.collapse : sh.expand}
                        >
                          {expanded ? "▾" : "▸"}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-medium text-zinc-900">{row.sku}</div>
                        <div className="max-w-[14rem] truncate text-[10px] text-zinc-500" title={row.name}>
                          {row.name}
                          <span className="ml-1 text-zinc-400">{row.paretoClass}</span>
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-zinc-800">{row.stockFinished}</td>
                      <td className="px-2 py-1.5 text-zinc-700">{row.wipKits ? row.wipKits : "—"}</td>
                      <td className="px-2 py-1.5 text-zinc-500">{parts.length || "—"}</td>
                      <td className="px-2 py-1.5 text-zinc-400">—</td>
                      <td className="px-2 py-1.5 text-zinc-400">—</td>
                      <td className="px-2 py-1.5 text-zinc-500">{fasteners.length || "—"}</td>
                      <td className="px-2 py-1.5 text-zinc-400">—</td>
                      <td className={`px-2 py-1.5 ${coverClass(row.monthsOfCover2m)}`}>
                        {fmtNum(row.monthsOfCover2m)}
                      </td>
                      <td className={`px-2 py-1.5 ${coverClass(row.monthsOfCover)}`}>
                        {fmtNum(row.monthsOfCover)}
                      </td>
                      <td className="bg-orange-50/40 px-2 py-1.5 text-zinc-800">{dash(salesYear)}</td>
                      <td className="bg-emerald-50/40 px-2 py-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
                            value={packVal}
                            onChange={(e) =>
                              setPackDraft((d) => ({ ...d, [row.kitProductId]: e.target.value }))
                            }
                            disabled={acting}
                          />
                          <button
                            type="button"
                            className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                            disabled={acting || !(Number(packVal) > 0)}
                            onClick={() => void setPackQty(row, Number(packVal))}
                          >
                            {sh.savePack}
                          </button>
                        </div>
                        {row.alreadyInRequest > 0 ? (
                          <div className="mt-0.5 text-[10px] text-zinc-500">
                            {t.kitBoms.alreadyInRequest}: {row.alreadyInRequest}
                          </div>
                        ) : null}
                      </td>
                      <td className="bg-emerald-50/40 px-2 py-1">
                        <div className="flex flex-wrap items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            className="w-16 rounded border border-zinc-200 bg-white px-1.5 py-0.5 text-xs"
                            value={produceVal}
                            onChange={(e) =>
                              setProduceDraft((d) => ({ ...d, [row.kitProductId]: e.target.value }))
                            }
                            disabled={acting}
                          />
                          <button
                            type="button"
                            className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
                            disabled={acting || !(Number(produceVal) > 0)}
                            onClick={() => void createProduceBatch(row, Number(produceVal))}
                            title={sh.produceHint}
                          >
                            +
                          </button>
                          {row.suggestedFactoryQty > 0 && row.bottleneckComponentId ? (
                            <button
                              type="button"
                              className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900 disabled:opacity-50"
                              disabled={acting}
                              onClick={() => void orderBottleneck(row)}
                            >
                              {sh.toFactory}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {expanded
                      ? parts.map((line) => (
                          <tr
                            key={`${row.kitProductId}-p-${line.componentProductId}`}
                            className="border-t border-zinc-100 bg-zinc-50/60"
                          >
                            <td />
                            <td className="px-2 py-1 pl-6 text-zinc-400">↳</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1">
                              <div className="font-medium text-zinc-800">{line.componentSku}</div>
                              <div className="max-w-[16rem] truncate text-[10px] text-zinc-500">
                                {line.componentName}
                                {line.isBottleneck ? (
                                  <span className="ml-1 text-rose-600">{sh.bottleneck}</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-zinc-800">{line.available}</td>
                            <td className="px-2 py-1 text-zinc-700">
                              {line.wipQty ? line.wipQty : "—"}
                            </td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-800">{line.qtyPerKit}</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                          </tr>
                        ))
                      : null}

                    {expanded
                      ? fasteners.map((line) => (
                          <tr
                            key={`${row.kitProductId}-f-${line.componentProductId}`}
                            className="border-t border-zinc-100 bg-zinc-50/40"
                          >
                            <td />
                            <td className="px-2 py-1 pl-6 text-zinc-400">↳</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1">
                              <div className="font-medium text-zinc-800">{line.componentSku}</div>
                              <div className="max-w-[14rem] truncate text-[10px] text-zinc-500">
                                {line.componentName}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-zinc-800">{line.qtyPerKit}</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                            <td className="px-2 py-1 text-zinc-400">—</td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
