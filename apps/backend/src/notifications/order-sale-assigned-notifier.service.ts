import { forwardRef, Inject, Injectable } from "@nestjs/common";
import type { DeliveryMethod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  normalizeNotificationRules,
  NOTIFICATION_RULES_KEY,
  saleAssignedDeliveryAllows,
} from "./notification-rules";
import { NotificationsService } from "./notifications.service";

const DELIVERY_LABELS: Record<string, string> = {
  PICKUP: "Самовивіз",
  NOVA_POSHTA: "Нова Пошта",
};

function deliveryLabel(method: DeliveryMethod | null | undefined): string | null {
  if (!method) return null;
  return DELIVERY_LABELS[method] ?? method;
}

function contactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
} | null): string | null {
  if (!contact) return null;
  const full = [contact.lastName, contact.firstName].filter(Boolean).join(" ").trim();
  return full || null;
}

@Injectable()
export class OrderSaleAssignedNotifierService {
  constructor(
    private readonly prisma: PrismaService,
    // Same cycle as OrderWarehouseNotifierService: the class is Object in design:paramtypes.
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {}

  async notifyIfNeeded(params: {
    orderId: string;
    newOwnerId: string;
    actorId?: string | null;
  }): Promise<void> {
    if (params.actorId && params.actorId === params.newOwnerId) {
      return;
    }

    const rulesRow = await this.prisma.systemSetting.findUnique({
      where: { id: NOTIFICATION_RULES_KEY },
      select: { value: true },
    });
    const rules = normalizeNotificationRules(rulesRow?.value);

    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        orderNumber: true,
        ownerId: true,
        deliveryMethod: true,
        client: { select: { firstName: true, lastName: true, city: true } },
        contact: { select: { firstName: true, lastName: true, city: true } },
      },
    });
    if (!order) return;
    if (order.ownerId !== params.newOwnerId) return;
    if (!saleAssignedDeliveryAllows(rules, order.deliveryMethod)) return;

    const client = order.client ?? order.contact;
    const name = contactDisplayName(client);
    const city = client?.city?.trim() || null;
    const delivery = deliveryLabel(order.deliveryMethod);

    let actorName: string | null = null;
    if (params.actorId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: params.actorId },
        select: { fullName: true },
      });
      actorName = actor?.fullName?.trim() || null;
    }

    const bodyParts = [name, city, delivery].filter(Boolean);
    const body = [
      bodyParts.length > 0 ? bodyParts.join(" · ") : null,
      actorName ? `Прийняв: ${actorName}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    await this.notifications.notifyWithTeamCopy({
      userId: params.newOwnerId,
      type: "CLIENT_ORDER_ACCEPTED",
      title: `Замовлення №${order.orderNumber} оформлено на вас`,
      body: body || null,
      entityType: "ORDER",
      entityId: order.id,
      actorId: params.actorId,
      meta: {
        orderNumber: order.orderNumber,
        deliveryMethod: order.deliveryMethod ?? null,
        actorName,
      },
    });
  }
}
