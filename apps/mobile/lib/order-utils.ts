import type { Order } from "@/types/crm";
import type { Product } from "@/types/crm";

export function deferredDueDateFrom(baseIsoLike?: string | null): string {
  const base = baseIsoLike ? new Date(baseIsoLike) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  const due = new Date(base);
  due.setDate(due.getDate() + 10);
  due.setHours(10, 0, 0, 0);
  return due.toISOString();
}

export function orderHasTtn(order: Order | null | undefined): boolean {
  if (!order) return false;
  const npLocal = order.deliveryData?.novaPoshta as { ttn?: { number?: string } } | undefined;
  const numFromData = npLocal?.ttn?.number;
  if (numFromData && String(numFromData).trim()) return true;
  const ttns = (order as { ttns?: unknown[] }).ttns;
  if ((ttns?.length ?? 0) > 0) return true;
  return false;
}

export type StockBreakdown = {
  qty: number;
  reserved: number;
  available: number;
};

export type WarehouseStockLine = StockBreakdown & {
  warehouseId: string;
  warehouseName: string;
};

function rowBreakdown(qty: number, availableQty?: number): StockBreakdown {
  const available = availableQty ?? qty;
  return { qty, reserved: Math.max(0, qty - available), available };
}

export function productPhysicalStock(product: Product): number | undefined {
  const stock = product.stock ?? product.totalStock;
  if (stock != null) return stock;
  if (!product.stockByWarehouse?.length) return undefined;
  return product.stockByWarehouse.reduce((sum, w) => sum + (w.qty ?? 0), 0);
}

export function warehouseStockBreakdown(
  product: Product,
  warehouseId: string | null | undefined,
): StockBreakdown | undefined {
  if (warehouseId && product.stockByWarehouse?.length) {
    const w = product.stockByWarehouse.find((x) => x.warehouseId === warehouseId);
    if (!w) return { qty: 0, reserved: 0, available: 0 };
    return rowBreakdown(w.qty ?? 0, w.availableQty);
  }
  return totalStockBreakdown(product);
}

export function totalStockBreakdown(product: Product): StockBreakdown | undefined {
  if (product.stockByWarehouse?.length) {
    let qty = 0;
    let available = 0;
    for (const w of product.stockByWarehouse) {
      const wQty = w.qty ?? 0;
      qty += wQty;
      available += w.availableQty ?? wQty;
    }
    return rowBreakdown(qty, available);
  }
  const qty = productPhysicalStock(product);
  if (qty == null) return undefined;
  return rowBreakdown(qty, product.availableStock ?? qty);
}

export function warehouseStockLines(product: Product): WarehouseStockLine[] {
  return (product.stockByWarehouse ?? []).map((w) => ({
    warehouseId: w.warehouseId,
    warehouseName: w.warehouseName ?? w.warehouseId,
    ...rowBreakdown(w.qty ?? 0, w.availableQty),
  }));
}

/** Available qty at warehouse (physical minus hard reservations). */
export function stockAtWarehouse(
  product: Product,
  warehouseId: string | null | undefined,
): number | undefined {
  return warehouseStockBreakdown(product, warehouseId)?.available;
}
