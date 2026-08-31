export type StockoutRow = {
  productId: string;
  sku: string;
  name: string;
  kind: "KIT" | "PART";
  inPareto80: boolean;
};

export type StockoutSummary = {
  zeroCount: number;
  paretoZeroCount: number;
  zeroKits: StockoutRow[];
  zeroParts: StockoutRow[];
};

/**
 * Positions with zero available stock from the latest posted snapshot.
 * Pareto 80%: kit in class A with stock 0, or part in BOM of any class-A kit with stock 0.
 */
export function computeStockouts(input: {
  kits: Array<{
    productId: string;
    sku: string;
    name: string;
    inPareto80: boolean;
    stockFinished: number;
  }>;
  parts: Array<{
    productId: string;
    sku: string;
    name: string;
    qty: number;
    inPareto80: boolean;
  }>;
}): StockoutSummary {
  const zeroKits: StockoutRow[] = input.kits
    .filter((k) => k.stockFinished <= 0)
    .map((k) => ({
      productId: k.productId,
      sku: k.sku,
      name: k.name,
      kind: "KIT" as const,
      inPareto80: k.inPareto80,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const zeroParts: StockoutRow[] = input.parts
    .filter((p) => p.qty <= 0)
    .map((p) => ({
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      kind: "PART" as const,
      inPareto80: p.inPareto80,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const paretoZeroCount =
    zeroKits.filter((k) => k.inPareto80).length + zeroParts.filter((p) => p.inPareto80).length;

  return {
    zeroCount: zeroKits.length + zeroParts.length,
    paretoZeroCount,
    zeroKits,
    zeroParts,
  };
}
