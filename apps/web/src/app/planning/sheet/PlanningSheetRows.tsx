"use client";

import { Fragment } from "react";
import { AlertTriangle } from "lucide-react";
import { strings } from "@/locales";
import type { KitBomListItem, KitBomListLine } from "@/lib/api/resources/planning";
import { QtyPresetInput } from "./QtyPresetInput";

function isPackagingLine(line: KitBomListLine): boolean {
  return /^PKG[:-]/i.test(line.componentSku.trim());
}

export function partLines(row: KitBomListItem): KitBomListLine[] {
  return row.lines.filter((l) => !l.isFastener && !isPackagingLine(l));
}

export function fastenerLines(lines: KitBomListLine[]): KitBomListLine[] {
  return lines.filter((l) => l.isFastener);
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

function isDeficitLine(line: KitBomListLine): boolean {
  return line.isBottleneck || line.available === 0;
}

function kitHasDeficit(row: KitBomListItem): boolean {
  if (row.bottleneckComponentId) return true;
  return row.lines.some((l) => !isPackagingLine(l) && (l.isBottleneck || l.available === 0));
}

const deficitBadge = "bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded";

type RowProps = {
  row: KitBomListItem;
  expanded: boolean;
  selected: boolean;
  acting: boolean;
  packVal: string;
  produceVal: string;
  onToggleCollapse: () => void;
  onToggleSelect: () => void;
  onPackChange: (value: string) => void;
  onProduceChange: (value: string) => void;
  onSavePack: () => void;
  onCreateProduce: () => void;
  onOrderFactory: () => void;
};

export function PlanningSheetKitGroup(props: RowProps) {
  const {
    row,
    expanded,
    selected,
    acting,
    packVal,
    produceVal,
    onToggleCollapse,
    onToggleSelect,
    onPackChange,
    onProduceChange,
    onSavePack,
    onCreateProduce,
    onOrderFactory,
  } = props;
  const t = strings.planning;
  const sh = t.sheet;
  const parts = partLines(row);
  const fasteners = fastenerLines(row.lines);
  const salesYear =
    row.avgMonthlySold > 0 ? Math.round(row.avgMonthlySold * 12 * 100) / 100 : null;
  const remPack =
    row.remainingPackIdeal ?? Math.max(0, row.canPackNow - (row.alreadyInRequest ?? 0));
  const hasDeficit = kitHasDeficit(row);
  const deficitSku = row.bottleneckSku ?? row.bottleneckName ?? "";
  const deficitTitle = deficitSku
    ? sh.deficitHint(deficitSku)
    : hasDeficit
      ? sh.deficitZeroStock
      : "";

  return (
    <Fragment>
      <tr className="border-t border-zinc-200 bg-white hover:bg-zinc-50/80">
        <td className="px-1 py-1">
          <div className="flex items-center justify-center gap-0.5">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-zinc-300"
              checked={selected}
              onChange={onToggleSelect}
              aria-label={sh.selectRow}
            />
            <button
              type="button"
              className="h-6 w-6 rounded text-zinc-500 hover:bg-zinc-100"
              onClick={onToggleCollapse}
              aria-label={expanded ? sh.collapse : sh.expand}
            >
              {expanded ? "▾" : "▸"}
            </button>
          </div>
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
            <QtyPresetInput
              value={packVal}
              onChange={onPackChange}
              disabled={acting}
              recommended={remPack > 0 ? remPack : null}
              lotBase={row.minPackLot}
            />
            <button
              type="button"
              className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
              disabled={acting || !(Number(packVal) > 0)}
              onClick={onSavePack}
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
            <QtyPresetInput
              value={produceVal}
              onChange={onProduceChange}
              disabled={acting}
              recommended={row.toWorkLot > 0 ? row.toWorkLot : null}
              lotBase={row.minProduceLot}
            />
            <button
              type="button"
              className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
              disabled={acting || !(Number(produceVal) > 0)}
              onClick={onCreateProduce}
              title={sh.produceHint}
            >
              +
            </button>
            {hasDeficit ? (
              <span title={deficitTitle} className="inline-flex text-red-600">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">{deficitTitle}</span>
              </span>
            ) : null}
            {row.suggestedFactoryQty > 0 && row.bottleneckComponentId ? (
              <button
                type="button"
                className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-900 disabled:opacity-50"
                disabled={acting}
                onClick={onOrderFactory}
                title={deficitTitle || undefined}
              >
                {sh.toFactory}
              </button>
            ) : null}
          </div>
        </td>
      </tr>

      {expanded
        ? parts.map((line) => (
            <BomPartRow
              key={`${row.kitProductId}-p-${line.componentProductId}`}
              line={line}
              bottleneckLabel={sh.bottleneck}
            />
          ))
        : null}

      {expanded
        ? fasteners.map((line) => (
            <BomFastenerRow
              key={`${row.kitProductId}-f-${line.componentProductId}`}
              line={line}
            />
          ))
        : null}
    </Fragment>
  );
}

function BomPartRow({ line, bottleneckLabel }: { line: KitBomListLine; bottleneckLabel: string }) {
  const deficit = isDeficitLine(line);
  return (
    <tr className="border-t border-zinc-100 bg-gray-50">
      <td className="border-l-2 border-indigo-200" />
      <td className="px-2 py-1 pl-4 text-zinc-400">↳</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 pl-4">
        <div className="font-medium text-zinc-800">{line.componentSku}</div>
        <div className="max-w-[16rem] truncate text-[10px] text-zinc-500">
          {line.componentName}
          {line.isBottleneck ? (
            <span className={`ml-1 ${deficitBadge}`}>{bottleneckLabel}</span>
          ) : null}
        </div>
      </td>
      <td className="px-2 py-1 text-zinc-800">
        {deficit ? <span className={deficitBadge}>{line.available}</span> : line.available}
      </td>
      <td className="px-2 py-1 text-zinc-700">{line.wipQty ? line.wipQty : "—"}</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-800">{line.qtyPerKit}</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
    </tr>
  );
}

function BomFastenerRow({ line }: { line: KitBomListLine }) {
  return (
    <tr className="border-t border-zinc-100 bg-gray-50">
      <td className="border-l-2 border-indigo-200" />
      <td className="px-2 py-1 pl-4 text-zinc-400">↳</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 pl-4">
        <div className="font-medium text-zinc-800">{line.componentSku}</div>
        <div className="max-w-[14rem] truncate text-[10px] text-zinc-500">{line.componentName}</div>
      </td>
      <td className="px-2 py-1 text-zinc-800">{line.qtyPerKit}</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
      <td className="px-2 py-1 text-zinc-400">—</td>
    </tr>
  );
}
