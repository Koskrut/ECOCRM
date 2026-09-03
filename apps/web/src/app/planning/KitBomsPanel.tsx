"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { strings } from "@/locales";
import { planningApi, type KitBomListItem } from "@/lib/api/resources/planning";

type SortKey =
  | "priority"
  | "sku"
  | "name"
  | "class"
  | "qty"
  | "ideal"
  | "stock"
  | "canPackNow"
  | "toWork"
  | "canPackCycle"
  | "toWorkCycle"
  | "alreadyInRequest"
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

function abcRank(c: "A" | "B" | "C"): number {
  return c === "A" ? 0 : c === "B" ? 1 : 2;
}

function parseCsvParam(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean);
}

function compareRows(a: KitBomListItem, b: KitBomListItem, key: SortKey, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  const num = (x: number | null | undefined) => (x == null || Number.isNaN(x) ? null : x);
  let cmp = 0;
  switch (key) {
    case "priority": {
      cmp = abcRank(a.paretoClass) - abcRank(b.paretoClass);
      if (cmp !== 0) return cmp;
      cmp = b.toWorkLot - a.toWorkLot;
      if (cmp !== 0) return cmp;
      const aw = num(a.weeksOfCover) ?? 9999;
      const bw = num(b.weeksOfCover) ?? 9999;
      return aw - bw;
    }
    case "sku":
      cmp = a.sku.localeCompare(b.sku, "uk");
      break;
    case "name":
      cmp = a.name.localeCompare(b.name, "uk");
      break;
    case "class":
      cmp = `${a.paretoClass}${a.xyzClass ?? ""}`.localeCompare(`${b.paretoClass}${b.xyzClass ?? ""}`);
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
      cmp = a.toWorkLot - b.toWorkLot;
      break;
    case "canPackCycle":
      cmp = a.canPackCycle - b.canPackCycle;
      break;
    case "toWorkCycle":
      cmp = a.toWorkCycle - b.toWorkCycle;
      break;
    case "alreadyInRequest":
      cmp = a.alreadyInRequest - b.alreadyInRequest;
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
  return a.sku.localeCompare(b.sku, "uk");
}

export function KitBomsPanel({ onError }: { onError: (msg: string) => void }) {
  const t = strings.planning;
  const kb = t.kitBoms;
  const board = t.kitBoard;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<KitBomListItem[]>([]);
  const [query, setQuery] = useState("");
  const [abcFilter, setAbcFilter] = useState<Array<"A" | "B" | "C">>(() =>
    parseCsvParam(searchParams.get("abc")).filter((x): x is "A" | "B" | "C" =>
      x === "A" || x === "B" || x === "C",
    ),
  );
  const [xyzFilter, setXyzFilter] = useState<Array<"X" | "Y" | "Z">>(() =>
    parseCsvParam(searchParams.get("xyz")).filter((x): x is "X" | "Y" | "Z" =>
      x === "X" || x === "Y" || x === "Z",
    ),
  );
  const [onlyDeficit, setOnlyDeficit] = useState(searchParams.get("deficit") === "1");
  const [busy, setBusy] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const syncFiltersToUrl = useCallback(
    (abc: Array<"A" | "B" | "C">, xyz: Array<"X" | "Y" | "Z">, deficit: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "kits");
      if (abc.length) params.set("abc", abc.join(","));
      else params.delete("abc");
      if (xyz.length) params.set("xyz", xyz.join(","));
      else params.delete("xyz");
      if (deficit) params.set("deficit", "1");
      else params.delete("deficit");
      router.replace(`/planning?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const abc = parseCsvParam(searchParams.get("abc")).filter(
      (x): x is "A" | "B" | "C" => x === "A" || x === "B" || x === "C",
    );
    const xyz = parseCsvParam(searchParams.get("xyz")).filter(
      (x): x is "X" | "Y" | "Z" => x === "X" || x === "Y" || x === "Z",
    );
    setAbcFilter(abc);
    setXyzFilter(xyz);
    setOnlyDeficit(searchParams.get("deficit") === "1");
  }, [searchParams]);

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
    if (onlyDeficit) {
      list = list.filter((r) => r.toWork > 0 || r.coverTarget > r.stockFinished);
    }
    return [...list].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, query, abcFilter, xyzFilter, onlyDeficit, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "sku" || key === "name" || key === "class" || key === "priority" ? "asc" : "desc");
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
      "canPackIdeal",
      "toWorkIdeal",
      "toWorkLot",
      "canPackCycle",
      "toWorkCycle",
      "alreadyInRequest",
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
          csvCell(kit.toWorkLot),
          csvCell(kit.canPackCycle),
          csvCell(kit.toWorkCycle),
          csvCell(kit.alreadyInRequest),
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

  const addToPack = async (row: KitBomListItem) => {
    if (row.canPackCycle < row.minPackLot) return;
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
      const nextQty = Math.max(row.alreadyInRequest + row.canPackCycle, row.minPackLot);
      await planningApi.setPackingKitQty(list.id, row.kitProductId, nextQty);
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.packing);
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

  const coverClass = (tone: KitBomListItem["coverTone"]) =>
    tone === "critical" ? "text-rose-700" : tone === "warn" ? "text-amber-700" : "text-zinc-800";

  const columns: Array<{ key: SortKey; label: string; title?: string }> = [
    { key: "sku", label: t.labels.sku },
    { key: "name", label: t.labels.name },
    { key: "class", label: kb.classCol },
    { key: "qty", label: kb.cycleNeed, title: kb.cycleNeedHint },
    { key: "ideal", label: kb.idealCol, title: kb.idealHint },
    { key: "stock", label: kb.stockCol },
    { key: "canPackNow", label: kb.canPackIdeal },
    { key: "toWork", label: kb.produceIdeal },
    { key: "canPackCycle", label: kb.canPackCycle },
    { key: "toWorkCycle", label: kb.toWorkCycle },
    { key: "alreadyInRequest", label: kb.alreadyInRequest },
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
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-900">
        {kb.banner}{" "}
        <Link href="/planning?tab=overview" className="underline">
          {t.tabs.overview}
        </Link>
        {" · "}
        <Link href="/planning?tab=requests&kind=pack" className="underline">
          {t.tabs.requests}
        </Link>
      </div>
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
            onClick={() => {
              const next = toggleClass(abcFilter, c);
              setAbcFilter(next);
              syncFiltersToUrl(next, xyzFilter, onlyDeficit);
            }}
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
            onClick={() => {
              const next = toggleClass(xyzFilter, c);
              setXyzFilter(next);
              syncFiltersToUrl(abcFilter, next, onlyDeficit);
            }}
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
          onClick={() => {
            const next = !onlyDeficit;
            setOnlyDeficit(next);
            syncFiltersToUrl(abcFilter, xyzFilter, next);
          }}
          className={
            onlyDeficit
              ? "rounded-full bg-rose-700 px-2.5 py-1 text-xs text-white"
              : "rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700"
          }
        >
          {kb.filterDeficit}
        </button>
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
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-2 text-left font-medium text-zinc-600"
                  title={col.title}
                >
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
              <th className="whitespace-nowrap px-2 py-2 text-left font-medium text-zinc-600">
                {t.labels.actions}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-4 text-zinc-500">
                  {busy ? strings.common.loading : t.states.none}
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const open = expandedId === row.kitProductId;
                const canPack = row.canPackCycle >= row.minPackLot;
                const canOrder =
                  row.toWorkLot > 0 &&
                  !!row.bottleneckComponentId &&
                  row.suggestedFactoryQty > 0;
                const produceHint = kb.produceLotHint(row.toWork, row.toWorkLot);
                return (
                  <Fragment key={row.kitProductId}>
                    <tr className="hover:bg-zinc-50">
                      <td
                        className="cursor-pointer whitespace-nowrap px-2 py-1.5 font-medium text-zinc-900"
                        onClick={() => setExpandedId(open ? null : row.kitProductId)}
                      >
                        <span className="mr-1 text-zinc-400">{open ? "▾" : "▸"}</span>
                        {row.sku}
                      </td>
                      <td
                        className="max-w-[12rem] cursor-pointer truncate px-2 py-1.5 text-zinc-800"
                        title={row.name}
                        onClick={() => setExpandedId(open ? null : row.kitProductId)}
                      >
                        {row.name}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-800">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium">
                          {board.classBadge(row.paretoClass, row.xyzClass)}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800" title={kb.cycleNeedHint}>
                        {row.targetStock}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800" title={kb.idealHint}>
                        {row.coverTarget}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-800">{row.stockFinished}</td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.canPackNow > 0 ? "font-medium text-cyan-700" : "text-zinc-800"}`}
                      >
                        {row.canPackNow}
                      </td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.toWorkLot > 0 ? "font-medium text-rose-700" : "text-zinc-800"}`}
                        title={produceHint ?? undefined}
                      >
                        {row.toWorkLot}
                      </td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.canPackCycle > 0 ? "text-cyan-700" : "text-zinc-800"}`}
                      >
                        {row.canPackCycle}
                      </td>
                      <td
                        className={`px-2 py-1.5 tabular-nums ${row.toWorkCycle > 0 ? "text-rose-700" : "text-zinc-800"}`}
                      >
                        {row.toWorkCycle}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-zinc-700">
                        {row.alreadyInRequest > 0 ? row.alreadyInRequest : "—"}
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
                      <td className="px-2 py-1.5">
                        <div className="flex flex-col gap-1">
                          {canPack ? (
                            <button
                              type="button"
                              disabled={actingId === row.kitProductId}
                              className="rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-medium text-cyan-900 disabled:opacity-50"
                              onClick={() => void addToPack(row)}
                            >
                              {kb.addToPack}
                            </button>
                          ) : row.canPackCycle > 0 ? (
                            <span className="text-[10px] text-zinc-500">
                              {kb.belowMinPack(row.minPackLot)}
                            </span>
                          ) : null}
                          {canOrder ? (
                            <button
                              type="button"
                              disabled={actingId === row.kitProductId}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 disabled:opacity-50"
                              onClick={() => void orderBottleneck(row)}
                            >
                              {kb.orderBottleneck}
                            </button>
                          ) : null}
                          <Link
                            href={`/planning?tab=requests&kind=pack&sku=${encodeURIComponent(row.sku)}`}
                            className="text-[10px] text-zinc-500 underline"
                          >
                            {t.tabs.requests}
                          </Link>
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="bg-zinc-50/80">
                        <td colSpan={columns.length + 1} className="px-4 py-3">
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
