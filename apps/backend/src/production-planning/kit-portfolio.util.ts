import { PlanningDemandMix } from "@prisma/client";
import { mixKitDemand, uncoveredKitDemand } from "./demand-mix.util";
import { constrainsKitCapacity, displayBottleneckSku } from "./bom-part.util";

export type KitPile = "ending" | "ok" | "idle";
export type EndingReason = "orders" | "cover" | "both";
export type ParetoClass = "A" | "B" | "C";
export type CoverTone = "critical" | "warn" | "ok";

export type ParetoRow<T> = T & {
  paretoClass: ParetoClass;
  sharePct: number;
  cumulativePct: number;
  inPareto80: boolean;
};

/** Finished kits + what we can assemble now. */
export function effectiveStock(stockFinished: number, maxBuildNow: number): number {
  return Math.max(0, stockFinished) + Math.max(0, maxBuildNow);
}

/** Weeks the effective stock lasts at avg monthly 1C velocity. Null when there are no sales. */
export function weeksOfCover(stock: number, avgMonthlySold: number): number | null {
  if (!(avgMonthlySold > 0)) return null;
  const days = (Math.max(0, stock) / avgMonthlySold) * 30;
  return Math.round((days / 7) * 10) / 10;
}

export function coverTone(weeks: number | null, warnWeeks: number, criticalWeeks: number): CoverTone {
  if (weeks == null) return "ok";
  if (weeks < criticalWeeks) return "critical";
  if (weeks < warnWeeks) return "warn";
  return "ok";
}

/**
 * Exclusive piles. No sales + leftover → idle (do not treat infinite cover as "ending").
 * Uncovered hard orders always win over idle.
 */
export function assignPile(input: {
  avgMonthlySold: number;
  stockFinished: number;
  maxBuildNow: number;
  hardNeed: number;
  weeksOfCover: number | null;
  warnWeeks: number;
}): { pile: KitPile; endingReason: EndingReason | null } {
  const stock = effectiveStock(input.stockFinished, input.maxBuildNow);
  const noSales = !(input.avgMonthlySold > 0);
  const ordersUncovered = input.hardNeed > input.stockFinished;
  const coverLow =
    input.weeksOfCover != null && input.weeksOfCover < input.warnWeeks;

  if (noSales && !ordersUncovered) {
    return { pile: stock > 0 ? "idle" : "ok", endingReason: null };
  }

  let endingReason: EndingReason | null = null;
  if (ordersUncovered && coverLow) endingReason = "both";
  else if (ordersUncovered) endingReason = "orders";
  else if (coverLow) endingReason = "cover";
  else if (input.maxBuildNow <= 0 && input.hardNeed > input.stockFinished) {
    endingReason = "orders";
  }

  if (endingReason) return { pile: "ending", endingReason };
  return { pile: "ok", endingReason: null };
}

/** Same formula as packing-list targetPack: mix demand for the cycle, minus on-hand kits. */
export function computeWeeklyPackNeed(input: {
  hardNeed: number;
  forecastNeed: number;
  softNeed?: number;
  stockKits: number;
  demandMix: PlanningDemandMix;
}): number {
  const mixed = mixKitDemand(
    input.demandMix,
    input.hardNeed,
    input.forecastNeed,
    input.softNeed ?? 0,
  );
  return uncoveredKitDemand(mixed, input.stockKits);
}

/** MRP cover norm (warnCoverDays) — display/tooltip only, not used for pack button. */
export function computeCoverTarget(input: {
  avgMonthlySold: number;
  warnWeeks: number;
}): number {
  if (!(input.avgMonthlySold > 0)) return 0;
  return Math.ceil((input.avgMonthlySold * (input.warnWeeks * 7)) / 30);
}

/** Rank by CRM revenue. A = cumulative up to 80%, B to 95%, rest C. Zero revenue is always C. */
export function assignParetoClasses<T extends { revenue: number }>(
  rows: T[],
  aCut = 0.8,
  bCut = 0.95,
): Array<ParetoRow<T>> {
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((s, r) => s + Math.max(0, r.revenue), 0);
  let cumulative = 0;
  return sorted.map((row) => {
    const revenue = Math.max(0, row.revenue);
    if (total <= 0 || revenue <= 0) {
      return { ...row, paretoClass: "C" as const, sharePct: 0, cumulativePct: 100, inPareto80: false };
    }
    const prevPct = (cumulative / total) * 100;
    cumulative += revenue;
    const sharePct = Math.round((revenue / total) * 1000) / 10;
    const cumulativePct = Math.round((cumulative / total) * 1000) / 10;
    const paretoClass: ParetoClass =
      prevPct < aCut * 100 ? "A" : prevPct < bCut * 100 ? "B" : "C";
    return {
      ...row,
      paretoClass,
      sharePct,
      cumulativePct,
      inPareto80: paretoClass === "A",
    };
  });
}

export type KitPositionPlan = {
  coverTarget: number;
  targetStock: number;
  stockNow: number;
  packGap: number;
  canPackNow: number;
  toWork: number;
};

/**
 * Weekly pack plan (14d cycle): targetStock = cycle pack need (same as targetPack),
 * coverTarget = MRP norm for tooltip only.
 */
export function computeKitPositionPlan(input: {
  stockFinished: number;
  maxBuildNow: number;
  weeklyPackNeed: number;
  coverTarget?: number;
  alreadyInRequest?: number;
}): KitPositionPlan {
  const stockNow = Math.max(0, Math.floor(input.stockFinished));
  const maxBuildNow = Math.max(0, Math.floor(input.maxBuildNow));
  const already = Math.max(0, Math.floor(input.alreadyInRequest ?? 0));
  const coverTarget = Math.max(0, Math.floor(input.coverTarget ?? 0));
  const weeklyNeed = Math.max(0, Math.floor(input.weeklyPackNeed));
  const targetStock = weeklyNeed;
  const packGap = Math.max(0, weeklyNeed - already);
  const partsRemaining = Math.max(0, maxBuildNow - already);
  const canPackNow = Math.min(packGap, partsRemaining);
  const toWork = Math.max(0, packGap - canPackNow);
  return { coverTarget, targetStock, stockNow, packGap, canPackNow, toWork };
}

/** Absolute qty that should be on the draft packing list for this SKU this cycle. */
export function suggestedPackTargetQty(input: {
  weeklyPackNeed: number;
  maxBuildNow: number;
  alreadyInRequest: number;
  weekCapacityLeft: number;
  ignoreParts?: boolean;
}): number {
  const already = Math.max(0, Math.floor(input.alreadyInRequest));
  const need = Math.max(0, Math.floor(input.weeklyPackNeed));
  if (need <= 0) return already;
  const maxFromParts = input.ignoreParts
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(input.maxBuildNow));
  if (!input.ignoreParts && maxFromParts <= 0) return already;
  const room = Math.max(0, Math.floor(input.weekCapacityLeft));
  return Math.floor(Math.min(need, maxFromParts, already + room));
}

/** Increment to add via pack button (target minus already in request). */
export function suggestedPackQty(input: {
  weeklyPackNeed: number;
  maxBuildNow: number;
  alreadyInRequest: number;
  weekCapacityLeft: number;
  ignoreParts?: boolean;
}): number {
  const target = suggestedPackTargetQty(input);
  const already = Math.max(0, Math.floor(input.alreadyInRequest));
  return Math.max(0, target - already);
}

export function sortEndingKits<T extends { maxBuildNow: number; weeksOfCover: number | null; revenue: number }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aCan = a.maxBuildNow > 0 ? 0 : 1;
    const bCan = b.maxBuildNow > 0 ? 0 : 1;
    if (aCan !== bCan) return aCan - bCan;
    const aw = a.weeksOfCover ?? 9999;
    const bw = b.weeksOfCover ?? 9999;
    if (aw !== bw) return aw - bw;
    return b.revenue - a.revenue;
  });
}

export type SharedBottleneckKit = {
  productId: string;
  pile: KitPile;
  maxBuildNow: number;
  bottleneckComponentId: string | null;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  bottleneckQtyPerKit: number;
  suggestedPackIgnoringParts: number;
};

export type SharedBottleneckGroup = {
  componentId: string;
  sku: string;
  name: string;
  kitIds: string[];
  kitCount: number;
  suggestedQty: number;
};

/** Same missing part blocking 2+ ending kits → one factory action. */
export function groupSharedBottlenecks(
  kits: SharedBottleneckKit[],
  partAvailableById: Map<string, number> = new Map(),
  minKits = 2,
): SharedBottleneckGroup[] {
  const byPart = new Map<string, SharedBottleneckKit[]>();
  for (const kit of kits) {
    if (kit.pile !== "ending") continue;
    if (kit.maxBuildNow > 0) continue;
    if (!kit.bottleneckComponentId) continue;
    const list = byPart.get(kit.bottleneckComponentId) ?? [];
    list.push(kit);
    byPart.set(kit.bottleneckComponentId, list);
  }

  const groups: SharedBottleneckGroup[] = [];
  for (const [componentId, list] of byPart) {
    if (list.length < minKits) continue;
    const first = list[0]!;
    const qtyPerKit = Math.max(0, first.bottleneckQtyPerKit);
    const kitsWanted = list.reduce((s, k) => s + Math.max(0, k.suggestedPackIgnoringParts), 0);
    const available = partAvailableById.get(componentId) ?? 0;
    const suggestedQty = Math.max(1, Math.ceil(kitsWanted * qtyPerKit) - Math.floor(available));
    groups.push({
      componentId,
      sku: first.bottleneckSku ?? componentId,
      name: first.bottleneckName && first.bottleneckName !== first.bottleneckSku ? first.bottleneckName : first.bottleneckSku ?? "",
      kitIds: list.map((k) => k.productId),
      kitCount: list.length,
      suggestedQty,
    });
  }
  groups.sort((a, b) => b.kitCount - a.kitCount || a.sku.localeCompare(b.sku));
  return groups;
}

export type BomBuildLine = {
  componentProductId: string;
  sku: string;
  name?: string | null;
  qtyPerKit: number;
  scrapPct?: number;
  available: number;
};

export function computeKitBuild(lines: BomBuildLine[]): {
  maxBuildNow: number;
  bottleneckComponentId: string | null;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  bottleneckQtyPerKit: number;
  components: Array<{
    componentProductId: string;
    sku: string;
    name: string;
    qtyPerKit: number;
    available: number;
    isBottleneck: boolean;
    constrainsCapacity: boolean;
  }>;
} {
  const enriched = lines.map((line) => {
    const constrains = constrainsKitCapacity({ sku: line.sku, name: line.name });
    const effectiveQty = line.qtyPerKit * (1 + (line.scrapPct ?? 0) / 100);
    const ratio = constrains && effectiveQty > 0 ? line.available / effectiveQty : Number.POSITIVE_INFINITY;
    return { ...line, constrains, ratio, effectiveQty };
  });
  const constraining = enriched.filter((c) => c.constrains).sort((a, b) => a.ratio - b.ratio);
  const bottleneck = constraining[0];
  const maxBuildNow = bottleneck ? Math.max(0, Math.floor(bottleneck.ratio)) : 0;
  return {
    maxBuildNow,
    bottleneckComponentId: bottleneck?.componentProductId ?? null,
    bottleneckSku: bottleneck ? displayBottleneckSku(bottleneck.sku, bottleneck.name) : null,
    bottleneckName: bottleneck?.name ?? null,
    bottleneckQtyPerKit: bottleneck?.qtyPerKit ?? 0,
    components: enriched.map((c) => ({
      componentProductId: c.componentProductId,
      sku: c.sku,
      name: c.name ?? c.sku,
      qtyPerKit: c.qtyPerKit,
      available: c.available,
      isBottleneck: bottleneck != null && c.componentProductId === bottleneck.componentProductId,
      constrainsCapacity: c.constrains,
    })),
  };
}
