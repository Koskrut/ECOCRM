import { BadRequestException } from "@nestjs/common";

export function assertReturnReasonChange(current: string, next: string): void {
  if (current === next) return;
  if (current === "WRONG_ITEM" || next === "WRONG_ITEM") {
    throw new BadRequestException("Причину пересорту змінити не можна");
  }
}

/** Map returned qty onto the new order by productId. Null when a line cannot be matched. */
export function rematchReturnItemsByProduct(
  current: Array<{ qtyReturned: number; productId: string | null | undefined }>,
  newOrderItems: Array<{ id: string; productId: string | null | undefined; qty: number }>,
  otherReturnedByItem: ReadonlyMap<string, number> = new Map(),
): Array<{ orderItemId: string; qtyReturned: number }> | null {
  const freeByProduct = new Map<string, Array<{ id: string; remaining: number }>>();
  for (const item of newOrderItems) {
    if (!item.productId) continue;
    const remaining = Math.max(0, item.qty - (otherReturnedByItem.get(item.id) ?? 0));
    if (remaining <= 0) continue;
    const list = freeByProduct.get(item.productId) ?? [];
    list.push({ id: item.id, remaining });
    freeByProduct.set(item.productId, list);
  }

  const out = new Map<string, number>();
  for (const row of current) {
    if (!row.productId) return null;
    const buckets = freeByProduct.get(row.productId);
    if (!buckets?.length) return null;
    let need = row.qtyReturned;
    for (const bucket of buckets) {
      if (need <= 0) break;
      const take = Math.min(bucket.remaining, need);
      if (take <= 0) continue;
      bucket.remaining -= take;
      need -= take;
      out.set(bucket.id, (out.get(bucket.id) ?? 0) + take);
    }
    if (need > 0) return null;
  }
  return Array.from(out.entries()).map(([orderItemId, qtyReturned]) => ({
    orderItemId,
    qtyReturned,
  }));
}

export function buildReturnItemEdits(input: {
  orderItems: Array<{ id: string; qty: number }>;
  otherReturnedByItem: ReadonlyMap<string, number>;
  items: Array<{ orderItemId: string; qtyReturned: number }>;
}): Array<{ orderItemId: string; qtyReturned: number }> {
  const orderById = new Map(input.orderItems.map((item) => [item.id, item]));
  const merged = new Map<string, number>();

  for (const item of input.items) {
    const orderItem = orderById.get(item.orderItemId);
    if (!orderItem) {
      throw new BadRequestException(`Позиції ${item.orderItemId} немає в замовленні`);
    }
    const qty = Math.floor(Number(item.qtyReturned));
    if (!Number.isFinite(qty) || qty < 1) {
      throw new BadRequestException("Кількість повернення має бути не менше 1");
    }
    merged.set(item.orderItemId, (merged.get(item.orderItemId) ?? 0) + qty);
  }

  if (merged.size === 0) {
    throw new BadRequestException("Потрібна хоча б одна позиція");
  }

  const out: Array<{ orderItemId: string; qtyReturned: number }> = [];
  for (const [orderItemId, qtyReturned] of merged) {
    const orderItem = orderById.get(orderItemId)!;
    const takenElsewhere = Math.max(0, Number(input.otherReturnedByItem.get(orderItemId) ?? 0));
    const max = Math.max(0, orderItem.qty - takenElsewhere);
    if (qtyReturned > max) {
      throw new BadRequestException(
        `Кількість повернення більша за доступну: ${qtyReturned} > ${max}`,
      );
    }
    out.push({ orderItemId, qtyReturned });
  }
  return out;
}
