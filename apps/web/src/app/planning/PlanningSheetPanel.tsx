"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { strings } from "@/locales";
import { planningApi, type KitBomListItem, type KitBomListLine } from "@/lib/api/resources/planning";
import { PlanningSheetTable } from "./sheet/PlanningSheetTable";
import { SheetBulkToolbar } from "./sheet/SheetBulkToolbar";

type AbcFilter = "A" | "B" | "C";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isPackagingLine(line: KitBomListLine): boolean {
  return /^PKG[:-]/i.test(line.componentSku.trim());
}

function hasAction(row: KitBomListItem): boolean {
  const rem = row.remainingPackIdeal ?? Math.max(0, row.canPackNow - (row.alreadyInRequest ?? 0));
  return rem > 0 || row.toWorkLot > 0 || row.toWork > 0;
}

function batchCodeFor(sku: string): string {
  const slug = sku.replace(/[^A-Za-z0-9]+/g, "").slice(0, 10) || "KIT";
  return `PB-${slug}-${Date.now().toString(36).toUpperCase()}`;
}

async function ensurePackingDraft() {
  let list = (await planningApi.listPackingLists(5))[0] ?? null;
  if (list?.status === "APPROVED") {
    list = await planningApi.reopenPackingList(list.id);
  }
  if (!list || list.status !== "DRAFT") {
    const proposed = await planningApi.proposePackingList();
    list = proposed.list;
  }
  return list?.status === "DRAFT" ? list : null;
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
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [packDraft, setPackDraft] = useState<Record<string, string>>({});
  const [produceDraft, setProduceDraft] = useState<Record<string, string>>({});
  const [actingId, setActingId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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

  const collapseAll = () => {
    setCollapsed(new Set(visible.map((r) => r.kitProductId)));
  };

  const expandAll = () => {
    setCollapsed(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allSelected = visible.length > 0 && visible.every((r) => selected.has(r.kitProductId));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((r) => r.kitProductId)));
    }
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
      const list = await ensurePackingDraft();
      if (!list) {
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

  const bulkPack = async () => {
    const targets = visible.filter((r) => selected.has(r.kitProductId));
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      const list = await ensurePackingDraft();
      if (!list) {
        onError(t.errors.packing);
        return;
      }
      let wrote = 0;
      for (const row of targets) {
        const qty = Number(packDraft[row.kitProductId] ?? "");
        if (!(qty > 0) || qty < row.minPackLot) {
          if (qty > 0 && qty < row.minPackLot) {
            onError(t.kitBoms.belowMinPack(row.minPackLot));
          }
          continue;
        }
        await planningApi.setPackingKitQty(list.id, row.kitProductId, qty);
        wrote += 1;
      }
      if (wrote > 0) await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.packing);
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkProduce = async () => {
    const targets = visible.filter((r) => selected.has(r.kitProductId));
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      let wrote = 0;
      for (const row of targets) {
        const qty = Number(produceDraft[row.kitProductId] ?? "");
        if (!(qty > 0)) continue;
        await planningApi.createBatch({
          code: batchCodeFor(row.sku),
          productId: row.kitProductId,
          qtyPlanned: qty,
        });
        wrote += 1;
      }
      if (wrote > 0) await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : t.errors.createBatch);
    } finally {
      setBulkBusy(false);
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
          return [
            [
              ...kitCells,
              "kit",
              "",
              "",
              "",
              "",
              "",
              csvCell(kit.canPackNow),
              csvCell(kit.toWorkLot),
              csvCell(kit.alreadyInRequest),
            ].join(","),
          ];
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
          <button
            key={c}
            type="button"
            className={chipClass(abcFilter.includes(c))}
            onClick={() => toggleAbc(c)}
          >
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
          onClick={collapseAll}
          disabled={visible.length === 0}
        >
          {sh.collapseAll}
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
          onClick={expandAll}
          disabled={visible.length === 0}
        >
          {sh.expandAll}
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700"
          onClick={() => void load()}
        >
          {t.actions.refresh}
        </button>
      </div>

      <SheetBulkToolbar
        selectedCount={selected.size}
        busy={bulkBusy}
        onBulkPack={() => void bulkPack()}
        onBulkProduce={() => void bulkProduce()}
      />

      {loading ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-zinc-500">{sh.empty}</p>
      ) : (
        <PlanningSheetTable
          rows={visible}
          collapsed={collapsed}
          selected={selected}
          actingId={actingId}
          bulkBusy={bulkBusy}
          packDraft={packDraft}
          produceDraft={produceDraft}
          onToggleCollapse={toggleCollapse}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onPackChange={(id, value) => setPackDraft((d) => ({ ...d, [id]: value }))}
          onProduceChange={(id, value) => setProduceDraft((d) => ({ ...d, [id]: value }))}
          onSavePack={(row) => void setPackQty(row, Number(packDraft[row.kitProductId] ?? ""))}
          onCreateProduce={(row) =>
            void createProduceBatch(row, Number(produceDraft[row.kitProductId] ?? ""))
          }
          onOrderFactory={(row) => void orderBottleneck(row)}
        />
      )}
    </div>
  );
}
