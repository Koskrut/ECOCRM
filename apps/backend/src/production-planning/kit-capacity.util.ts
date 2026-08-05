import { constrainsKitCapacity, inferArticleSkuFromFalsePkg, looksLikeComponentSku, looksLikePackagingName } from "./bom-part.util";

export type BomCapacityLine = {
  sku: string;
  name?: string | null;
  qtyPerKit: number;
  scrapPct?: number;
  available: number;
};

/** Pure max-build math (mirrors PlanningCalculationService.getKitCapacity). */
export function computeMaxBuildFromBomLines(lines: BomCapacityLine[]): {
  maxBuildNow: number;
  bottleneckSku: string | null;
} {
  const components = lines.map((line) => {
    const constrains = constrainsKitCapacity({ sku: line.sku, name: line.name });
    const effectiveQty = line.qtyPerKit * (1 + (line.scrapPct ?? 0) / 100);
    const ratio =
      constrains && effectiveQty > 0 ? line.available / effectiveQty : Number.POSITIVE_INFINITY;
    return { sku: line.sku, constrains, ratio };
  });
  const constraining = components
    .filter((c) => c.constrains)
    .sort((a, b) => a.ratio - b.ratio);
  const bottleneck = constraining[0];
  return {
    maxBuildNow: bottleneck ? Math.max(0, Math.floor(bottleneck.ratio)) : 0,
    bottleneckSku: bottleneck?.sku ?? null,
  };
}

export function computeCanPackQty(unmetPackNeed: number, maxBuildNow: number): number {
  if (maxBuildNow <= 0 || unmetPackNeed <= 0) return 0;
  return Math.min(maxBuildNow, Math.ceil(unmetPackNeed));
}

export { looksLikeComponentSku, looksLikePackagingName, inferArticleSkuFromFalsePkg, constrainsKitCapacity };
