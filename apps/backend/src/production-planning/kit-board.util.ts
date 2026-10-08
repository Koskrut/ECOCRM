import {
  assignParetoClasses,
  assignXyzClass,
  fillPeriodSeries,
  recentYearMonthKeys,
} from "./kit-portfolio.util";

/** Snapshot lines with no warehouse. */
export const KIT_BOARD_UNASSIGNED_WAREHOUSE_ID = "__unassigned__";

/** Synthetic id: 39 ПФ ABM + 40 ГП ABM act as one pack pool. */
export const KIT_BOARD_PACK_POOL_ID = "__pack_abm_pool__";

/** Sales / cover window for pack & produce recommendations. */
export const KIT_BOARD_COVER_MONTHS = 3;
export const KIT_BOARD_SALES_LOOKBACK_MONTHS = 3;
/** History depth for ABC/XYZ (months). */
export const KIT_BOARD_CLASS_LOOKBACK_MONTHS = 12;

/**
 * Personal manager stocks, returns, and hardening — not company warehouses.
 * Matched after collapsing spaces and case.
 */
const EXCLUDED_WAREHOUSE_NAMES = [
  "ВОЗВРАТЫ",
  "Закалка",
  "Склад Алифанов Александр ( менеджер Херсон)",
  "Склад Бауэрс-Амел (Киев)",
  "Склад Букань Неля (менеджер Черкассы)",
  "Склад Кульбашная Янина ( менеджер Полтава)",
  "Склад Міліянчук Ярина (Львів)",
  "Склад Мущій Віталій (менеджер Чернівці)",
  "Склад Петраш Евгения ( Харьков) Демонабор",
  "Склад Яромщук Альбіна (Харків)",
] as const;

/** SKU prefix → implant system / product group (aligned with web product-groups). */
const PRODUCT_GROUP_NAMES: Record<string, string> = {
  "00": "Викрутки SUPREX",
  "01": "Straumann RC",
  "02": "Straumann NC",
  "03": "MegaGen AnyRidge",
  "04": "MegaGen AnyOne",
  "05": "MIS Seven",
  "06": "ICX",
  "07": "Straumann BLX",
  "08": "NeoDent",
  "09": "Straumann RN",
  "10": "OSSTEM Regular",
};

function warehouseMatchKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

const EXCLUDED_WAREHOUSE_KEYS = new Set(EXCLUDED_WAREHOUSE_NAMES.map(warehouseMatchKey));

export function isExcludedPlanningWarehouse(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return EXCLUDED_WAREHOUSE_KEYS.has(warehouseMatchKey(name));
}

function isDmtWarehouse(key: string): boolean {
  return /\bдмт\b/.test(key) || /\bdmt\b/.test(key);
}

function isVirtualOtkWarehouse(key: string): boolean {
  return (
    key.includes("на проверку") ||
    key.includes("виртуальн") ||
    key.includes("віртуальн")
  );
}

/**
 * Kit leftover / sales cover: warehouse 44 + regional Suprex.
 * Central «12 Склад Suprex», DMT and excluded personal managers do not count.
 */
export function isKitStockWarehouse(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  if (isExcludedPlanningWarehouse(name)) return false;
  const key = warehouseMatchKey(name);
  if (isDmtWarehouse(key) || isVirtualOtkWarehouse(key)) return false;
  // Central Suprex warehouse — not used for kit leftover / Увага.
  if (/^12\b/.test(key)) return false;
  if (/^44\b/.test(key)) return true;
  return /suprex|супрекс/.test(key);
}

/**
 * Pack assembly: only 39 ПФ ABM and 40 ГП ABM.
 * DMT and virtual ОТК do not participate.
 */
export function isPackRecommendationWarehouse(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const key = warehouseMatchKey(name);
  if (isDmtWarehouse(key) || isVirtualOtkWarehouse(key)) return false;
  const isAbm = /\babm\b/.test(key);
  if (!isAbm) return false;
  return /^39\b/.test(key) || /^40\b/.test(key);
}

export function filterPackWarehouses(warehouses: KitBoardWarehouse[]): KitBoardWarehouse[] {
  return warehouses.filter((w) => isPackRecommendationWarehouse(w.name));
}

export function filterKitStockWarehouses(warehouses: KitBoardWarehouse[]): KitBoardWarehouse[] {
  return warehouses.filter((w) => isKitStockWarehouse(w.name));
}

function sumQtyOnWarehouses(
  qtyByWarehouse: Record<string, number>,
  warehouseIds: ReadonlySet<string>,
): number {
  let total = 0;
  for (const [id, qty] of Object.entries(qtyByWarehouse)) {
    if (!warehouseIds.has(id) || !Number.isFinite(qty)) continue;
    total += qty;
  }
  return total;
}

export function productGroupNameFromSku(sku: string): string {
  const s = sku.trim();
  const prefix = s.length >= 2 ? s.slice(0, 2) : s || "";
  return PRODUCT_GROUP_NAMES[prefix] ?? (prefix || "—");
}

export function charString(
  characteristics: unknown,
  key: string,
): string | null {
  if (!characteristics || typeof characteristics !== "object" || Array.isArray(characteristics)) {
    return null;
  }
  const value = (characteristics as Record<string, unknown>)[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Implant system: characteristics first, else SKU prefix group name. */
export function resolveKitSystem(sku: string, characteristics: unknown): string {
  return charString(characteristics, "implant_system") ?? productGroupNameFromSku(sku);
}

export function resolveKitCategory(characteristics: unknown): string | null {
  return charString(characteristics, "category_name");
}

export type SnapshotStockLine = {
  productId: string | null;
  qty: number;
  warehouseId: string | null;
  /** Column title from the 1C file («12 Склад Suprex»). */
  warehouseRaw: string | null;
  warehouseName?: string | null;
};

/**
 * Columns are the warehouses from the uploaded stock file, not the CRM warehouse directory.
 * A name that is not in the directory still gets its own column.
 */
export function groupSnapshotStock(lines: SnapshotStockLine[]): {
  warehouses: KitBoardWarehouse[];
  qtyByProduct: Map<string, Record<string, number>>;
} {
  const qtyByProduct = new Map<string, Record<string, number>>();
  const warehouses: KitBoardWarehouse[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (!line.productId || !(line.qty > 0)) continue;
    const raw = line.warehouseRaw?.trim() ?? "";
    const name = raw || line.warehouseName?.trim() || KIT_BOARD_UNASSIGNED_WAREHOUSE_ID;
    if (isExcludedPlanningWarehouse(name)) continue;
    const id = raw
      ? `raw:${raw}`
      : line.warehouseId || KIT_BOARD_UNASSIGNED_WAREHOUSE_ID;
    if (!seen.has(id)) {
      seen.add(id);
      warehouses.push({ id, name });
    }
    const row = qtyByProduct.get(line.productId) ?? {};
    row[id] = (row[id] ?? 0) + line.qty;
    qtyByProduct.set(line.productId, row);
  }

  warehouses.sort((a, b) => {
    if (a.id === KIT_BOARD_UNASSIGNED_WAREHOUSE_ID) return 1;
    if (b.id === KIT_BOARD_UNASSIGNED_WAREHOUSE_ID) return -1;
    return a.name.localeCompare(b.name, "uk");
  });

  return { warehouses, qtyByProduct };
}

export type KitBoardTone = "pack" | "enough" | "missing_parts" | "parts_shared" | "no_sales";

export type ParetoClass = "A" | "B" | "C";
export type XyzClass = "X" | "Y" | "Z";

export type KitBoardPartInput = {
  productId: string;
  sku: string;
  name: string;
  qtyPerKit: number;
  scrapPct: number;
  constrains: boolean;
  qtyByWarehouse: Record<string, number>;
};

export type KitBoardKitInput = {
  productId: string;
  sku: string;
  name: string;
  qtyByWarehouse: Record<string, number>;
  /** Average kits sold per month from CRM orders (recommendation window). */
  avgMonthlySold: number;
  /** CRM revenue over classification window (kit ABC). */
  revenue: number;
  /** Monthly shipped qty keyed by YYYY-MM (classification window). */
  monthlySold: Record<string, number>;
  system: string;
  category: string | null;
  parts: KitBoardPartInput[];
};

export type KitBoardWarehouse = {
  id: string;
  name: string;
};

export type KitBoardPartRow = {
  productId: string;
  sku: string;
  name: string;
  qtyPerKit: number;
  constrains: boolean;
  qtyByWarehouse: Record<string, number>;
  qtyTotal: number;
  paretoClass: ParetoClass;
  xyzClass: XyzClass | null;
};

export type KitBoardRow = {
  productId: string;
  sku: string;
  name: string;
  qtyByWarehouse: Record<string, number>;
  /** All company warehouses (display / hover). */
  qtyTotal: number;
  /** Kit leftover on 44 + Suprex — used for sales cover / Увага. */
  qtyStockTotal: number;
  avgMonthlySold: number;
  need: number;
  /** Pack pool (39+40 ABM) build from current part stock, before other kits take parts. */
  canAssemble: number;
  /** {@link KIT_BOARD_PACK_POOL_ID} when canAssemble > 0. */
  canAssembleWarehouseId: string | null;
  /** Per-warehouse build for display; pack qty uses the pooled total. */
  assembleByWarehouse: Record<string, number>;
  /**
   * How many kits can still be built from the 39+40 ABM pool after higher-need kits took shared parts.
   * Safer default for «можна» → заявка than raw canAssemble.
   */
  canAssembleRemaining: number;
  /** Suggested pack qty after higher-need kits consume shared parts. */
  toPack: number;
  /** {@link KIT_BOARD_PACK_POOL_ID} when toPack > 0. */
  toPackWarehouseId: string | null;
  /** Gap that cannot be closed by packing parts already on hand. */
  toProduce: number;
  tone: KitBoardTone;
  paretoClass: ParetoClass;
  xyzClass: XyzClass | null;
  system: string;
  category: string | null;
  parts: KitBoardPartRow[];
};

function sumQty(qtyByWarehouse: Record<string, number>): number {
  let total = 0;
  for (const qty of Object.values(qtyByWarehouse)) {
    if (Number.isFinite(qty)) total += qty;
  }
  return total;
}

function effectivePerKit(qtyPerKit: number, scrapPct: number): number {
  return Math.max(0, qtyPerKit) * (1 + Math.max(0, scrapPct) / 100);
}

function partQty(
  stock: Map<string, Record<string, number>> | null,
  part: KitBoardPartInput,
  warehouseId: string,
): number {
  const qty = stock
    ? (stock.get(part.productId)?.[warehouseId] ?? 0)
    : (part.qtyByWarehouse[warehouseId] ?? 0);
  return Math.max(0, qty);
}

/** How many kits one warehouse can build. Parts on other warehouses do not count. */
export function kitsOnWarehouse(
  parts: KitBoardPartInput[],
  warehouseId: string,
  stock: Map<string, Record<string, number>> | null = null,
): number {
  const constraining = parts.filter((part) => part.constrains);
  if (constraining.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const part of constraining) {
    const per = effectivePerKit(part.qtyPerKit, part.scrapPct);
    if (!(per > 0)) return 0;
    min = Math.min(min, Math.floor(partQty(stock, part, warehouseId) / per));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

function partQtyInWarehouses(
  stock: Map<string, Record<string, number>> | null,
  part: KitBoardPartInput,
  warehouseIds: string[],
): number {
  let total = 0;
  for (const warehouseId of warehouseIds) {
    total += partQty(stock, part, warehouseId);
  }
  return total;
}

/**
 * How many kits the 39+40 ABM pack pool can build.
 * Constraining parts sum across the pool; min over BOM limits capacity.
 */
export function kitsOnPackPool(
  parts: KitBoardPartInput[],
  warehouseIds: string[],
  stock: Map<string, Record<string, number>> | null = null,
): number {
  if (warehouseIds.length === 0) return 0;
  const constraining = parts.filter((part) => part.constrains);
  if (constraining.length === 0) return 0;
  let min = Number.POSITIVE_INFINITY;
  for (const part of constraining) {
    const per = effectivePerKit(part.qtyPerKit, part.scrapPct);
    if (!(per > 0)) return 0;
    min = Math.min(min, Math.floor(partQtyInWarehouses(stock, part, warehouseIds) / per));
  }
  return Number.isFinite(min) ? Math.max(0, min) : 0;
}

export function kitNeed(avgMonthlySold: number, kitStock: number, coverMonths: number): number {
  if (!(avgMonthlySold > 0) || !(coverMonths > 0)) return 0;
  return Math.max(0, Math.ceil(avgMonthlySold * coverMonths - Math.max(0, kitStock)));
}

function initPartStock(kits: KitBoardKitInput[]): Map<string, Record<string, number>> {
  const stock = new Map<string, Record<string, number>>();
  for (const kit of kits) {
    for (const part of kit.parts) {
      if (stock.has(part.productId)) continue;
      stock.set(part.productId, { ...part.qtyByWarehouse });
    }
  }
  return stock;
}

/** Deduct constraining parts from the pack pool (walk warehouses until each part's need is met). */
function consumePartsFromPool(
  parts: KitBoardPartInput[],
  warehouseIds: string[],
  kitsQty: number,
  stock: Map<string, Record<string, number>>,
): void {
  if (kitsQty <= 0 || warehouseIds.length === 0) return;
  for (const part of parts) {
    if (!part.constrains) continue;
    const row = stock.get(part.productId);
    if (!row) continue;
    let left = effectivePerKit(part.qtyPerKit, part.scrapPct) * kitsQty;
    for (const warehouseId of warehouseIds) {
      if (!(left > 0)) break;
      const have = Math.max(0, row[warehouseId] ?? 0);
      const take = Math.min(have, left);
      row[warehouseId] = have - take;
      left -= take;
    }
  }
}

function packPoolCapacity(
  parts: KitBoardPartInput[],
  warehouses: KitBoardWarehouse[],
  stock: Map<string, Record<string, number>> | null,
): { qty: number; byWarehouse: Record<string, number> } {
  const warehouseIds = warehouses.map((w) => w.id);
  const byWarehouse: Record<string, number> = {};
  for (const warehouse of warehouses) {
    byWarehouse[warehouse.id] = kitsOnWarehouse(parts, warehouse.id, stock);
  }
  return {
    qty: kitsOnPackPool(parts, warehouseIds, stock),
    byWarehouse,
  };
}

function toneFor(input: {
  avgMonthlySold: number;
  need: number;
  canAssemble: number;
  toPack: number;
}): KitBoardTone {
  if (!(input.avgMonthlySold > 0)) return "no_sales";
  if (input.toPack > 0) return "pack";
  if (input.need === 0) return "enough";
  if (input.canAssemble === 0) return "missing_parts";
  return "parts_shared";
}

function abcRank(c: ParetoClass): number {
  return c === "A" ? 0 : c === "B" ? 1 : 2;
}

function xyzRank(c: XyzClass | null): number {
  if (c === "X") return 0;
  if (c === "Y") return 1;
  if (c === "Z") return 2;
  return 3;
}

function classBadge(pareto: ParetoClass, xyz: XyzClass | null): string {
  return xyz ? `${pareto}${xyz}` : pareto;
}

export { abcRank, xyzRank, classBadge };

function sumMonthly(monthly: Record<string, number>): number {
  let total = 0;
  for (const qty of Object.values(monthly)) {
    if (Number.isFinite(qty) && qty > 0) total += qty;
  }
  return total;
}

function classifyKits(
  kits: KitBoardKitInput[],
  monthKeys: string[],
): Map<string, { paretoClass: ParetoClass; xyzClass: XyzClass | null }> {
  const kitById = new Map(kits.map((kit) => [kit.productId, kit]));
  const ranked = assignParetoClasses(
    kits.map((kit) => ({ productId: kit.productId, revenue: Math.max(0, kit.revenue) })),
  );
  const byId = new Map<string, { paretoClass: ParetoClass; xyzClass: XyzClass | null }>();
  for (const row of ranked) {
    const kit = kitById.get(row.productId);
    const series = fillPeriodSeries(kit?.monthlySold ?? {}, monthKeys);
    const xyz = assignXyzClass(series, { source: "sales_months" });
    byId.set(row.productId, {
      paretoClass: row.paretoClass,
      xyzClass: xyz.xyzClass,
    });
  }
  return byId;
}

function classifyParts(
  kits: KitBoardKitInput[],
  monthKeys: string[],
): Map<string, { paretoClass: ParetoClass; xyzClass: XyzClass | null }> {
  const volumeByPart = new Map<string, number>();
  const monthlyByPart = new Map<string, Record<string, number>>();

  for (const kit of kits) {
    for (const part of kit.parts) {
      const per = Math.max(0, part.qtyPerKit);
      if (!(per > 0)) continue;
      volumeByPart.set(
        part.productId,
        (volumeByPart.get(part.productId) ?? 0) + sumMonthly(kit.monthlySold) * per,
      );
      const monthRow = monthlyByPart.get(part.productId) ?? {};
      for (const key of monthKeys) {
        const kitQty = kit.monthlySold[key] ?? 0;
        if (kitQty > 0) monthRow[key] = (monthRow[key] ?? 0) + kitQty * per;
      }
      monthlyByPart.set(part.productId, monthRow);
    }
  }

  const ranked = assignParetoClasses(
    [...volumeByPart.entries()].map(([productId, revenue]) => ({ productId, revenue })),
  );
  const byId = new Map<string, { paretoClass: ParetoClass; xyzClass: XyzClass | null }>();
  for (const row of ranked) {
    const series = fillPeriodSeries(monthlyByPart.get(row.productId) ?? {}, monthKeys);
    const xyz = assignXyzClass(series, { source: "sales_months" });
    byId.set(row.productId, {
      paretoClass: row.paretoClass,
      xyzClass: xyz.xyzClass,
    });
  }
  return byId;
}

function sortParts(
  parts: KitBoardPartRow[],
): KitBoardPartRow[] {
  return [...parts].sort(
    (a, b) =>
      abcRank(a.paretoClass) - abcRank(b.paretoClass) ||
      xyzRank(a.xyzClass) - xyzRank(b.xyzClass) ||
      a.sku.localeCompare(b.sku),
  );
}

export function buildKitBoard(input: {
  warehouses: KitBoardWarehouse[];
  kits: KitBoardKitInput[];
  coverMonths?: number;
  /** Classification month keys (YYYY-MM). Defaults to last 12 calendar months. */
  monthKeys?: string[];
}): KitBoardRow[] {
  const coverMonths = Math.max(0, input.coverMonths ?? KIT_BOARD_COVER_MONTHS);
  const monthKeys = input.monthKeys ?? recentYearMonthKeys(new Date(), KIT_BOARD_CLASS_LOOKBACK_MONTHS);
  const kitClass = classifyKits(input.kits, monthKeys);
  const partClass = classifyParts(input.kits, monthKeys);
  const packWarehouses = filterPackWarehouses(input.warehouses);
  const stockWarehouses = filterKitStockWarehouses(input.warehouses);
  const stockWarehouseIds = new Set(stockWarehouses.map((w) => w.id));

  const ranked = input.kits.map((kit) => ({
    kit,
    // Cover / Увага: kits on 44 + Suprex. Pack capacity uses 39/40 ABM separately.
    need: kitNeed(
      kit.avgMonthlySold,
      sumQtyOnWarehouses(kit.qtyByWarehouse, stockWarehouseIds),
      coverMonths,
    ),
  }));
  ranked.sort(
    (a, b) => b.need - a.need || a.kit.sku.localeCompare(b.kit.sku),
  );

  const remaining = initPartStock(input.kits);
  const rows: KitBoardRow[] = [];

  const packWarehouseIds = packWarehouses.map((w) => w.id);

  for (const { kit, need } of ranked) {
    const physical = packPoolCapacity(kit.parts, packWarehouses, null);
    const remainingBuild = packPoolCapacity(kit.parts, packWarehouses, remaining);
    const toPack =
      kit.avgMonthlySold > 0 ? Math.min(need, remainingBuild.qty) : 0;
    const toPackWarehouseId = toPack > 0 ? KIT_BOARD_PACK_POOL_ID : null;
    if (toPack > 0) {
      consumePartsFromPool(kit.parts, packWarehouseIds, toPack, remaining);
    }
    const toProduce = Math.max(0, need - toPack);
    const cls = kitClass.get(kit.productId) ?? { paretoClass: "C" as const, xyzClass: null };

    const parts = sortParts(
      kit.parts.map((part) => {
        const pCls = partClass.get(part.productId) ?? {
          paretoClass: "C" as const,
          xyzClass: null,
        };
        return {
          productId: part.productId,
          sku: part.sku,
          name: part.name,
          qtyPerKit: part.qtyPerKit,
          constrains: part.constrains,
          qtyByWarehouse: part.qtyByWarehouse,
          qtyTotal: sumQty(part.qtyByWarehouse),
          paretoClass: pCls.paretoClass,
          xyzClass: pCls.xyzClass,
        };
      }),
    );

    rows.push({
      productId: kit.productId,
      sku: kit.sku,
      name: kit.name,
      qtyByWarehouse: kit.qtyByWarehouse,
      qtyTotal: sumQty(kit.qtyByWarehouse),
      qtyStockTotal: sumQtyOnWarehouses(kit.qtyByWarehouse, stockWarehouseIds),
      avgMonthlySold: kit.avgMonthlySold,
      need,
      canAssemble: physical.qty,
      canAssembleWarehouseId: physical.qty > 0 ? KIT_BOARD_PACK_POOL_ID : null,
      assembleByWarehouse: physical.byWarehouse,
      canAssembleRemaining: remainingBuild.qty,
      toPack,
      toPackWarehouseId,
      toProduce,
      tone: toneFor({
        avgMonthlySold: kit.avgMonthlySold,
        need,
        canAssemble: physical.qty,
        toPack,
      }),
      paretoClass: cls.paretoClass,
      xyzClass: cls.xyzClass,
      system: kit.system,
      category: kit.category,
      parts,
    });
  }

  rows.sort(
    (a, b) =>
      abcRank(a.paretoClass) - abcRank(b.paretoClass) ||
      xyzRank(a.xyzClass) - xyzRank(b.xyzClass) ||
      b.need - a.need ||
      a.sku.localeCompare(b.sku),
  );
  return rows;
}
