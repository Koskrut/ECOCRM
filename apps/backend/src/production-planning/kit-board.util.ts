import {
  assignParetoClasses,
  assignXyzClass,
  fillPeriodSeries,
  recentYearMonthKeys,
} from "./kit-portfolio.util";

/** Snapshot lines with no warehouse. */
export const KIT_BOARD_UNASSIGNED_WAREHOUSE_ID = "__unassigned__";

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
  qtyTotal: number;
  avgMonthlySold: number;
  need: number;
  /** Best single-warehouse build from current part stock, before other kits take parts. */
  canAssemble: number;
  canAssembleWarehouseId: string | null;
  assembleByWarehouse: Record<string, number>;
  /** Suggested pack qty after higher-need kits consume shared parts. */
  toPack: number;
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

function consumeParts(
  parts: KitBoardPartInput[],
  warehouseId: string,
  kitsQty: number,
  stock: Map<string, Record<string, number>>,
): void {
  if (kitsQty <= 0) return;
  for (const part of parts) {
    if (!part.constrains) continue;
    const row = stock.get(part.productId);
    if (!row) continue;
    const per = effectivePerKit(part.qtyPerKit, part.scrapPct);
    const prev = row[warehouseId] ?? 0;
    row[warehouseId] = Math.max(0, prev - per * kitsQty);
  }
}

function bestWarehouse(
  parts: KitBoardPartInput[],
  warehouses: KitBoardWarehouse[],
  stock: Map<string, Record<string, number>> | null,
): { qty: number; warehouseId: string | null; byWarehouse: Record<string, number> } {
  const byWarehouse: Record<string, number> = {};
  let qty = 0;
  let warehouseId: string | null = null;
  for (const warehouse of warehouses) {
    const n = kitsOnWarehouse(parts, warehouse.id, stock);
    byWarehouse[warehouse.id] = n;
    if (n > qty) {
      qty = n;
      warehouseId = warehouse.id;
    }
  }
  return { qty, warehouseId, byWarehouse };
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

  const ranked = input.kits.map((kit) => ({
    kit,
    need: kitNeed(kit.avgMonthlySold, sumQty(kit.qtyByWarehouse), coverMonths),
  }));
  ranked.sort(
    (a, b) => b.need - a.need || a.kit.sku.localeCompare(b.kit.sku),
  );

  const remaining = initPartStock(input.kits);
  const rows: KitBoardRow[] = [];

  for (const { kit, need } of ranked) {
    const physical = bestWarehouse(kit.parts, input.warehouses, null);
    const remainingBuild = bestWarehouse(kit.parts, input.warehouses, remaining);
    const toPack =
      kit.avgMonthlySold > 0 ? Math.min(need, remainingBuild.qty) : 0;
    const toPackWarehouseId = toPack > 0 ? remainingBuild.warehouseId : null;
    if (toPack > 0 && toPackWarehouseId) {
      consumeParts(kit.parts, toPackWarehouseId, toPack, remaining);
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
      avgMonthlySold: kit.avgMonthlySold,
      need,
      canAssemble: physical.qty,
      canAssembleWarehouseId: physical.qty > 0 ? physical.warehouseId : null,
      assembleByWarehouse: physical.byWarehouse,
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
