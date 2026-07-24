import { Injectable } from "@nestjs/common";
import type { OrderStage } from "@prisma/client";
import { ActivityType } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { isWarehouseRole } from "../orders/order-warehouse-role";
import { NotificationsService } from "./notifications.service";

const ORDER_STAGE_LABELS: Record<string, string> = {
  NEW: "Нове",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує наявність",
  CONFIRMED: "Підтверджено",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
  FULLY_RETURNED: "Повернений",
};

function stageLabel(stage: OrderStage | null | undefined): string {
  if (!stage) return "—";
  return ORDER_STAGE_LABELS[stage] ?? stage;
}

@Injectable()
export class OrderWarehouseNotifierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyQtyChanged(params: {
    orderId: string;
    itemId: string;
    prevQty: number;
    nextQty: number;
    prevTotalAmount: number;
    nextTotalAmount: number;
    actor?: AuthUser;
  }): Promise<void> {
    if (!params.actor || !isWarehouseRole(params.actor)) {
      return;
    }
    if (params.prevQty === params.nextQty) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        orderNumber: true,
        ownerId: true,
        currency: true,
      },
    });
    if (!order) {
      return;
    }

    const item = await this.prisma.orderItem.findFirst({
      where: { id: params.itemId, orderId: params.orderId },
      select: {
        id: true,
        productNameSnapshot: true,
        product: { select: { name: true } },
      },
    });
    const productName =
      item?.product?.name?.trim() ||
      item?.productNameSnapshot?.trim() ||
      "Позиція";

    const actorName = await this.resolveActorName(params.actor);

    await this.prisma.activity.create({
      data: {
        type: ActivityType.COMMENT,
        title: "Зміна кількості (склад)",
        body: `${productName}: ${params.prevQty}→${params.nextQty} шт.${actorName ? ` (${actorName})` : ""}`,
        createdBy: params.actor.id,
        orderId: params.orderId,
      },
    });

    await this.notifications.createDebouncedQtyChange({
      userId: order.ownerId,
      orderId: order.id,
      orderNumber: order.orderNumber,
      currency: order.currency,
      actorId: params.actor.id,
      actorName,
      change: {
        itemId: params.itemId,
        productName,
        prevQty: params.prevQty,
        nextQty: params.nextQty,
      },
      prevTotalAmount: params.prevTotalAmount,
      nextTotalAmount: params.nextTotalAmount,
      debounceKey: `order:${params.orderId}:qty_changed`,
    });
  }

  async notifySplit(params: {
    parentOrderId: string;
    childOrderId: string;
    childOrderNumber: string;
    actor?: AuthUser;
  }): Promise<void> {
    if (!params.actor || !isWarehouseRole(params.actor)) {
      return;
    }

    const parent = await this.prisma.order.findUnique({
      where: { id: params.parentOrderId },
      select: { id: true, orderNumber: true, ownerId: true },
    });
    if (!parent) {
      return;
    }

    const actorName = await this.resolveActorName(params.actor);
    const title = `Замовлення №${parent.orderNumber} розділено`;
    const body = `Створено дочірнє замовлення №${params.childOrderNumber}.${actorName ? ` Кладовщик: ${actorName}` : ""}`;

    await this.notifications.notifyWithTeamCopy({
      userId: parent.ownerId,
      type: "ORDER_SPLIT",
      title,
      body,
      entityType: "ORDER",
      entityId: parent.id,
      actorId: params.actor.id,
      meta: {
        childOrderId: params.childOrderId,
        childOrderNumber: params.childOrderNumber,
        actorName,
      },
    });
  }

  async notifyStageChanged(params: {
    orderId: string;
    fromStage: OrderStage | null | undefined;
    toStage: OrderStage;
    actor?: AuthUser;
  }): Promise<void> {
    if (!params.actor || !isWarehouseRole(params.actor)) {
      return;
    }
    if ((params.fromStage ?? "NEW") === params.toStage) {
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: { id: true, orderNumber: true, ownerId: true },
    });
    if (!order) {
      return;
    }

    const actorName = await this.resolveActorName(params.actor);
    const fromLabel = stageLabel(params.fromStage);
    const toLabel = stageLabel(params.toStage);
    const title = `Замовлення №${order.orderNumber}: ${fromLabel} → ${toLabel}`;
    const body = `Стадію змінено кладовщиком${actorName ? ` (${actorName})` : ""}.`;

    await this.prisma.activity.create({
      data: {
        type: ActivityType.COMMENT,
        title: "Зміна стадії (склад)",
        body: `${fromLabel} → ${toLabel}${actorName ? ` (${actorName})` : ""}`,
        createdBy: params.actor.id,
        orderId: params.orderId,
      },
    });

    await this.notifications.notifyWithTeamCopy({
      userId: order.ownerId,
      type: "ORDER_STAGE_CHANGED",
      title,
      body,
      entityType: "ORDER",
      entityId: order.id,
      actorId: params.actor.id,
      meta: {
        fromStage: params.fromStage ?? null,
        toStage: params.toStage,
        actorName,
      },
    });
  }

  private async resolveActorName(actor: AuthUser): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { fullName: true },
    });
    return user?.fullName?.trim() || null;
  }
}
