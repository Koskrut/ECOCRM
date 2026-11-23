import { BadRequestException } from "@nestjs/common";

export function assertReturnReasonChange(current: string, next: string): void {
  if (current === next) return;
  if (current === "WRONG_ITEM" || next === "WRONG_ITEM") {
    throw new BadRequestException("Причину пересорту змінити не можна");
  }
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
