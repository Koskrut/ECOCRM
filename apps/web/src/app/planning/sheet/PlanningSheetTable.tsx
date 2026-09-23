"use client";

import { strings } from "@/locales";
import type { KitBomListItem } from "@/lib/api/resources/planning";
import { PlanningSheetKitGroup } from "./PlanningSheetRows";

const thBase =
  "sticky top-0 z-10 border-b border-zinc-200 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide";

type Props = {
  rows: KitBomListItem[];
  collapsed: Set<string>;
  selected: Set<string>;
  actingId: string | null;
  bulkBusy: boolean;
  packDraft: Record<string, string>;
  produceDraft: Record<string, string>;
  onToggleCollapse: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onPackChange: (id: string, value: string) => void;
  onProduceChange: (id: string, value: string) => void;
  onSavePack: (row: KitBomListItem) => void;
  onCreateProduce: (row: KitBomListItem) => void;
  onOrderFactory: (row: KitBomListItem) => void;
};

export function PlanningSheetTable({
  rows,
  collapsed,
  selected,
  actingId,
  bulkBusy,
  packDraft,
  produceDraft,
  onToggleCollapse,
  onToggleSelect,
  onToggleSelectAll,
  onPackChange,
  onProduceChange,
  onSavePack,
  onCreateProduce,
  onOrderFactory,
}: Props) {
  const sh = strings.planning.sheet;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.kitProductId));
  const someSelected = rows.some((r) => selected.has(r.kitProductId));

  return (
    <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
      <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-xs tabular-nums">
        <thead>
          <tr>
            <th className={`${thBase} w-14 bg-zinc-50 text-zinc-600`}>
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-zinc-300"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected;
                }}
                onChange={onToggleSelectAll}
                aria-label={sh.selectAll}
              />
            </th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colSku}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colGp}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colWipKits}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colParts}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colPartStock}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colPartWip}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colFasteners}</th>
            <th className={`${thBase} bg-zinc-50 text-zinc-600`}>{sh.colQty}</th>
            <th className={`${thBase} bg-emerald-100 text-emerald-900`}>{sh.colCover2m}</th>
            <th className={`${thBase} bg-emerald-100 text-emerald-900`}>{sh.colCover}</th>
            <th className={`${thBase} bg-orange-100 text-orange-950`}>{sh.colSalesYear}</th>
            <th className={`${thBase} bg-emerald-100 text-emerald-900`}>{sh.colPack}</th>
            <th className={`${thBase} bg-emerald-100 text-emerald-900`}>{sh.colProduce}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PlanningSheetKitGroup
              key={row.kitProductId}
              row={row}
              expanded={!collapsed.has(row.kitProductId)}
              selected={selected.has(row.kitProductId)}
              acting={actingId === row.kitProductId || bulkBusy}
              packVal={packDraft[row.kitProductId] ?? ""}
              produceVal={produceDraft[row.kitProductId] ?? ""}
              onToggleCollapse={() => onToggleCollapse(row.kitProductId)}
              onToggleSelect={() => onToggleSelect(row.kitProductId)}
              onPackChange={(v) => onPackChange(row.kitProductId, v)}
              onProduceChange={(v) => onProduceChange(row.kitProductId, v)}
              onSavePack={() => onSavePack(row)}
              onCreateProduce={() => onCreateProduce(row)}
              onOrderFactory={() => onOrderFactory(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
