import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | {
  warehouse: Prisma.WarehouseDelegate;
  order: Prisma.OrderDelegate;
};

export async function resolveReturnWarehouseId(
  db: Db,
  opts: { warehouseId?: string | null; orderId?: string | null },
): Promise<string | null> {
  if (opts.warehouseId) {
    const wh = await db.warehouse.findUnique({
      where: { id: opts.warehouseId },
      select: { id: true },
    });
    if (!wh) throw new BadRequestException("Warehouse not found");
    return wh.id;
  }
  if (opts.orderId) {
    const order = await db.order.findUnique({
      where: { id: opts.orderId },
      select: { warehouseId: true },
    });
    if (order?.warehouseId) return order.warehouseId;
  }
  return null;
}
