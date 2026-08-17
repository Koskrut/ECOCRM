"use client";

import type { ReactNode } from "react";
import type { ProductCatalogItem } from "@/lib/api";
import { ProductCharacteristicsPanel } from "./ProductCharacteristicsPanel";

type CatalogProductCardProps = {
  product: ProductCatalogItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenImages: () => void;
  onShowOnStoreChange: (checked: boolean) => void | Promise<void>;
  warehouseNames: readonly string[];
  qtyAtWarehouse: (p: ProductCatalogItem, name: string) => number;
  stockTitleAtWarehouse?: (p: ProductCatalogItem, name: string) => string | undefined;
  deleteButton: ReactNode;
  editButton: ReactNode;
  activateButton: ReactNode;
};

export function CatalogProductCard({
  product: p,
  expanded,
  onToggleExpand,
  onOpenImages,
  onShowOnStoreChange,
  warehouseNames,
  qtyAtWarehouse,
  stockTitleAtWarehouse,
  deleteButton,
  editButton,
  activateButton,
}: CatalogProductCardProps) {
  return (
    <article
      className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${
        p.isActive === false ? "opacity-90" : ""
      } ${expanded ? "ring-1 ring-zinc-300" : ""}`}
    >
      <div className="flex gap-3 p-3">
        <button
          type="button"
          onClick={onOpenImages}
          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
          title="Фото товара"
        >
          {p.primaryImageId ? (
            <img
              src={`/api/products/images/${p.primaryImageId}/source`}
              alt=""
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-lg text-zinc-400">—</span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="w-full text-left"
          >
            <p className="font-mono text-sm font-medium text-zinc-900">{p.sku}</p>
            {p.externalCode ? (
              <p className="mt-0.5 font-mono text-xs text-zinc-500">1С {p.externalCode}</p>
            ) : null}
            <p className="mt-0.5 line-clamp-2 text-sm text-zinc-800">{p.name}</p>
          </button>

          {p.isActive === false && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                неактивен
              </span>
              {activateButton}
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-zinc-600">
            <span>
              <span className="text-xs uppercase text-zinc-500">Цена </span>
              <span className="font-medium text-zinc-900">{p.basePrice}</span>
            </span>
            {p.unit ? (
              <span>
                <span className="text-xs uppercase text-zinc-500">Ед. </span>
                {p.unit}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs tabular-nums text-zinc-700">
            {warehouseNames.map((wh, i) => (
              <span key={wh} title={stockTitleAtWarehouse?.(p, wh)}>
                {i > 0 ? <span className="text-zinc-300"> · </span> : null}
                <span className="text-zinc-500">{wh}</span> {qtyAtWarehouse(p, wh)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-zinc-100 px-3 py-2">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={p.showOnStore ?? true}
            onChange={(e) => void onShowOnStoreChange(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          На сайте
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100"
            aria-expanded={expanded}
            aria-label={expanded ? "Сховати характеристики" : "Показати характеристики"}
          >
            <svg
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div onClick={(e) => e.stopPropagation()}>{editButton}</div>
          <div onClick={(e) => e.stopPropagation()}>{deleteButton}</div>
        </div>
      </div>

      {expanded ? (
        <div className="border-t border-zinc-200 bg-zinc-50/95 px-3 py-3">
          <ProductCharacteristicsPanel product={p} />
        </div>
      ) : null}
    </article>
  );
}
