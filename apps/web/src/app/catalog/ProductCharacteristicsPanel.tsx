"use client";

import type { ProductCatalogItem } from "@/lib/api";
import {
  formatSpecValue,
  orderedSpecEntries,
  PRODUCT_SPEC_LABELS_UK,
} from "@/lib/product-spec-labels";

export function ProductCharacteristicsPanel({ product }: { product: ProductCatalogItem }) {
  const raw = product.characteristics;
  const entries =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? orderedSpecEntries(raw as Record<string, unknown>).filter(
          ([, v]) => v !== null && v !== undefined && v !== "",
        )
      : [];

  return (
    <div role="region" aria-label={`Характеристики ${product.sku}`}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Характеристики
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Немає заповнених характеристик. Імпорт з Excel:{" "}
          <code className="rounded bg-zinc-200/60 px-1 text-xs">команду імпорту характеристик</code>{" "}
          у бекенд-сервісі.
        </p>
      ) : (
        <dl className="grid grid-cols-1 gap-x-10 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map(([code, val]) => (
            <div
              key={code}
              className="flex flex-col gap-0.5 border-b border-zinc-200/70 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3"
            >
              <dt className="shrink-0 text-xs text-zinc-500 sm:w-[42%]">
                {PRODUCT_SPEC_LABELS_UK[code] ?? code}
              </dt>
              <dd className="text-sm font-medium text-zinc-900">{formatSpecValue(val)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
