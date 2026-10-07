/** Snapshot lines with no warehouse. */
export const KIT_BOARD_UNASSIGNED_WAREHOUSE_ID = "__unassigned__";

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
    const id = raw
      ? `raw:${raw}`
      : line.warehouseId || KIT_BOARD_UNASSIGNED_WAREHOUSE_ID;
    const name = raw || line.warehouseName?.trim() || KIT_BOARD_UNASSIGNED_WAREHOUSE_ID;
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
  /** Average kits sold per month from CRM orders. 0 means no sales history. */
  avgMonthlySold: number;
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
  tone: KitBoardTone;
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

const TONE_RANK: Record<KitBoardTone, number> = {
  pack: 0,
  missing_parts: 1,
  parts_shared: 2,
  enough: 3,
  no_sales: 4,
};

export function buildKitBoard(input: {
  warehouses: KitBoardWarehouse[];
  kits: KitBoardKitInput[];
  coverMonths: number;
}): KitBoardRow[] {
  const coverMonths = Math.max(0, input.coverMonths);
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
      tone: toneFor({
        avgMonthlySold: kit.avgMonthlySold,
        need,
        canAssemble: physical.qty,
        toPack,
      }),
      parts: kit.parts.map((part) => ({
        productId: part.productId,
        sku: part.sku,
        name: part.name,
        qtyPerKit: part.qtyPerKit,
        constrains: part.constrains,
        qtyByWarehouse: part.qtyByWarehouse,
        qtyTotal: sumQty(part.qtyByWarehouse),
      })),
    });
  }

  rows.sort(
    (a, b) =>
      TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
      b.toPack - a.toPack ||
      b.need - a.need ||
      a.sku.localeCompare(b.sku),
  );
  return rows;
}
