import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { OrderStage, ReservationStatus } from "@prisma/client";
import { DemandRulesService } from "../production-planning/demand-rules.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  STAGES_CONSUME_RESERVATION,
  STAGES_RELEASE_RESERVATION,
  STAGES_WITH_ACTIVE_RESERVATION,
} from "./order-material-reservation.constants";
import { reservationHardnessForStage } from "./reservation-hardness.util";

type DbClient = Prisma.TransactionClient | PrismaService;

/**
 * Keeps MaterialReservation rows aligned with orderStage.
 * Must be called whenever orderStage changes outside OrdersService.setOrderStage
 * (NP status sync, Bitrix delta sync, etc.) — otherwise ACTIVE HARD reservations
 * stick on shipped/received orders and inflate catalog hard_reserved.
 */
@Injectable()
export class OrderMaterialReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandRules: DemandRulesService,
  ) {}

  /**
   * Apply release / consume / resync policy for the given stage.
   * Prefer this after any direct orderStage write (NP, Bitrix, migrations).
   */
  async applyReservationPolicy(
    orderId: string,
    stage: OrderStage | null | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const db: DbClient = tx ?? this.prisma;
    const resolved = stage ?? OrderStage.NEW;

    if (STAGES_RELEASE_RESERVATION.has(resolved)) {
      await db.materialReservation.updateMany({
        where: { orderId, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.RELEASED },
      });
      return;
    }

    if (STAGES_CONSUME_RESERVATION.has(resolved)) {
      await db.materialReservation.updateMany({
        where: { orderId, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.CONSUMED },
      });
      return;
    }

    await this.syncActiveReservationsForOrder(orderId, tx);
  }

  /** Rebuild ACTIVE reservations from current order lines (open pipeline stages). */
  async syncActiveReservationsForOrder(
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (!tx) {
      await this.prisma.$transaction(async (innerTx) => {
        await this.syncActiveReservationsForOrder(orderId, innerTx);
      });
      return;
    }
    const db: DbClient = tx;
    const order = await db.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        warehouseId: true,
        orderStage: true,
        items: {
          select: {
            productId: true,
            qty: true,
            qtyShipped: true,
          },
        },
      },
    });
    if (!order) return;

    const stage = order.orderStage ?? OrderStage.NEW;
    const shouldKeepActive = STAGES_WITH_ACTIVE_RESERVATION.has(stage);

    await db.materialReservation.updateMany({
      where: { orderId, status: ReservationStatus.ACTIVE },
      data: {
        status: shouldKeepActive ? ReservationStatus.RELEASED : ReservationStatus.CONSUMED,
      },
    });

    if (!shouldKeepActive) return;

    const qtyByProduct = new Map<string, number>();
    for (const item of order.items) {
      if (!item.productId) continue;
      const remainingQty = Math.max(0, Number(item.qty) - Number(item.qtyShipped ?? 0));
      if (remainingQty <= 0) continue;
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + remainingQty);
    }
    if (qtyByProduct.size === 0) return;

    const rules = await this.demandRules.getRules();
    const hardness = reservationHardnessForStage(stage, rules);

    await db.materialReservation.createMany({
      data: Array.from(qtyByProduct.entries()).map(([productId, qty]) => ({
        productId,
        warehouseId: order.warehouseId ?? null,
        qty,
        hardness,
        status: ReservationStatus.ACTIVE,
        orderId,
      })),
    });
  }
}
