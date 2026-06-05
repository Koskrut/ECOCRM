export type OrderStockReadiness = "NONE" | "PARTIAL" | "FULL";

export type OrderItemForStockReadiness = {
  productId: string | null;
  qty: number;
  qtyShipped?: number;
};

export type OrderForStockReadiness = {
  orderStage?: string | null;
  warehouseId?: string | null;
  items: OrderItemForStockReadiness[];
};

/** Mirrors splitByStock: warehouse row qty if present, else Product.stock. */
export function resolveAvailableQty(
  productId: string,
  warehouseId: string | null | undefined,
  productStockById: Map<string, number>,
  warehouseStockByKey: Map<string, number>,
): number {
  if (warehouseId) {
    const key = `${warehouseId}:${productId}`;
    if (warehouseStockByKey.has(key)) {
      return Math.max(0, warehouseStockByKey.get(key) ?? 0);
    }
    return Math.max(0, productStockById.get(productId) ?? 0);
  }
  return Math.max(0, productStockById.get(productId) ?? 0);
}

export function computeOrderStockReadiness(
  order: OrderForStockReadiness,
  productStockById: Map<string, number>,
  warehouseStockByKey: Map<string, number>,
): OrderStockReadiness | null {
  if (order.orderStage !== "AWAITING_STOCK") return null;

  let hasProductLines = false;
  let hasAnyStock = false;
  let allLinesFullyCovered = true;

  for (const item of order.items) {
    const needed = item.qty - (item.qtyShipped ?? 0);
    if (needed <= 0) continue;

    if (!item.productId) {
      allLinesFullyCovered = false;
      continue;
    }

    hasProductLines = true;
    const available = resolveAvailableQty(
      item.productId,
      order.warehouseId,
      productStockById,
      warehouseStockByKey,
    );
    if (available > 0) hasAnyStock = true;
    if (available < needed) allLinesFullyCovered = false;
  }

  if (!hasProductLines) return "NONE";
  if (allLinesFullyCovered) return "FULL";
  if (hasAnyStock) return "PARTIAL";
  return "NONE";
}
