import {
  computeOrderStockReadiness,
  resolveAvailableQty,
  type OrderStockReadiness,
} from "../orders/order-stock-readiness";

export type AwaitingStockLineInput = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  warehouseId: string | null;
  productId: string | null;
  sku: string | null;
  name: string;
  qty: number;
  qtyShipped: number;
};

export type TodayAwaitingStockOrderLine = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  qtyRemaining: number;
  availableQty: number | null;
  stockReadiness: OrderStockReadiness | null;
};

export type TodayAwaitingStockGroup = {
  groupKey: string;
  productId: string | null;
  sku: string;
  name: string;
  totalQtyRemaining: number;
  availableQty: number | null;
  stockGap: number;
  orderCount: number;
  orders: TodayAwaitingStockOrderLine[];
};

export type TodayAwaitingStockView = {
  summary: { skuCount: number; orderCount: number; totalQty: number };
  groups: TodayAwaitingStockGroup[];
};

function remainingQty(line: AwaitingStockLineInput): number {
  return Math.max(0, line.qty - line.qtyShipped);
}

function groupKeyFor(line: AwaitingStockLineInput): string {
  if (line.productId) return line.productId;
  return `unmapped:${line.name.trim().toLowerCase()}`;
}

/** Group remaining AWAITING_STOCK order lines by SKU (or name when unmapped). */
export function groupAwaitingStockLines(
  lines: AwaitingStockLineInput[],
  productStockById: Map<string, number>,
  warehouseStockByKey: Map<string, number>,
): TodayAwaitingStockView {
  const remaining = lines.filter((line) => remainingQty(line) > 0);

  const itemsByOrder = new Map<
    string,
    { warehouseId: string | null; items: Array<{ productId: string | null; qty: number; qtyShipped: number }> }
  >();
  for (const line of remaining) {
    const bucket = itemsByOrder.get(line.orderId) ?? {
      warehouseId: line.warehouseId,
      items: [],
    };
    bucket.items.push({
      productId: line.productId,
      qty: line.qty,
      qtyShipped: line.qtyShipped,
    });
    itemsByOrder.set(line.orderId, bucket);
  }

  const readinessByOrder = new Map<string, OrderStockReadiness | null>();
  for (const [orderId, bucket] of itemsByOrder) {
    readinessByOrder.set(
      orderId,
      computeOrderStockReadiness(
        {
          orderStage: "AWAITING_STOCK",
          warehouseId: bucket.warehouseId,
          items: bucket.items,
        },
        productStockById,
        warehouseStockByKey,
      ),
    );
  }

  const groups = new Map<string, TodayAwaitingStockGroup>();
  for (const line of remaining) {
    const qtyRemaining = remainingQty(line);
    const key = groupKeyFor(line);
    const lineAvailable = line.productId
      ? resolveAvailableQty(
          line.productId,
          line.warehouseId,
          productStockById,
          warehouseStockByKey,
        )
      : null;

    const orderLine: TodayAwaitingStockOrderLine = {
      orderItemId: line.orderItemId,
      orderId: line.orderId,
      orderNumber: line.orderNumber,
      qtyRemaining,
      availableQty: lineAvailable,
      stockReadiness: readinessByOrder.get(line.orderId) ?? null,
    };

    const existing = groups.get(key);
    if (existing) {
      existing.totalQtyRemaining += qtyRemaining;
      existing.orders.push(orderLine);
      continue;
    }

    const catalogStock = line.productId ? (productStockById.get(line.productId) ?? 0) : null;
    groups.set(key, {
      groupKey: key,
      productId: line.productId,
      sku: line.sku?.trim() || "—",
      name: line.name.trim() || "—",
      totalQtyRemaining: qtyRemaining,
      availableQty: catalogStock,
      stockGap: 0,
      orderCount: 0,
      orders: [orderLine],
    });
  }

  const result = [...groups.values()].map((group) => {
    const orderIds = new Set(group.orders.map((o) => o.orderId));
    const stockGap = Math.max(0, group.totalQtyRemaining - (group.availableQty ?? 0));
    group.orders.sort((a, b) => a.orderNumber.localeCompare(b.orderNumber, "uk"));
    return {
      ...group,
      orderCount: orderIds.size,
      stockGap,
    };
  });

  result.sort((a, b) => {
    if (b.stockGap !== a.stockGap) return b.stockGap - a.stockGap;
    if (b.totalQtyRemaining !== a.totalQtyRemaining) return b.totalQtyRemaining - a.totalQtyRemaining;
    return a.sku.localeCompare(b.sku, "uk");
  });

  const allOrderIds = new Set(remaining.map((line) => line.orderId));
  const totalQty = remaining.reduce((sum, line) => sum + remainingQty(line), 0);

  return {
    summary: {
      skuCount: result.length,
      orderCount: allOrderIds.size,
      totalQty,
    },
    groups: result,
  };
}
