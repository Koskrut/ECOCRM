import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { OrderSource, type DeliveryMethod, type PaymentMethod, type PaymentType } from "@prisma/client";
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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  FOP: "ФОП",
  CASH: "Готівка",
};

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  PREPAYMENT: "Передплата",
  DEFERRED: "Відстрочка",
};

const STORE_ITEM_PREVIEW_LIMIT = 8;

function deliveryLabel(method: DeliveryMethod | null | undefined): string | null {
  if (!method) return null;
  return DELIVERY_LABELS[method] ?? method;
}

function contactDisplayName(contact: {
  firstName: string | null;
  lastName: string | null;
} | null): string | null {
  if (!contact) return null;
  const full = [contact.lastName, contact.firstName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part && part !== "—" && part !== "-")
    .join(" ")
    .trim();
  return full || null;
}

function money(amount: number, currency: string | null | undefined): string {
  const rounded = Math.round(amount * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  const code = currency?.trim();
  return code ? `${text} ${code}` : text;
}

function deliveryPlace(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const np = (data as { novaPoshta?: Record<string, unknown> }).novaPoshta;
  if (!np) return null;
  const city = typeof np.cityName === "string" ? np.cityName.trim() : "";
  const warehouse = typeof np.warehouseName === "string" ? np.warehouseName.trim() : "";
  const street = typeof np.streetName === "string" ? np.streetName.trim() : "";
  const building = typeof np.building === "string" ? np.building.trim() : "";
  const address = [street, building].filter(Boolean).join(" ");
  const place = [city, warehouse || address].filter(Boolean).join(", ");
  return place || null;
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

  /**
   * Store checkout (website or Telegram shop) already has an owner.
   * Ping that manager in the bot; staff-group mirror happens in delivery.
   */
  async notifyStoreCheckout(params: {
    orderId: string;
    channel: "website" | "telegram";
  }): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        orderNumber: true,
        ownerId: true,
        orderSource: true,
        totalAmount: true,
        discountAmount: true,
        currency: true,
        comment: true,
        deliveryMethod: true,
        paymentMethod: true,
        paymentType: true,
        deliveryData: true,
        client: {
          select: { firstName: true, lastName: true, phone: true, region: true, city: true },
        },
        contact: {
          select: { firstName: true, lastName: true, phone: true, region: true, city: true },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            qty: true,
            productNameSnapshot: true,
            product: { select: { name: true } },
          },
        },
      },
    });
    if (!order?.ownerId) return;
    if (order.orderSource !== OrderSource.STORE) return;

    const client = order.client ?? order.contact;
    const source = params.channel === "website" ? "сайту" : "Telegram";
    const title = `Нове замовлення з ${source} №${order.orderNumber}`;

    await this.notifications.notifyWithTeamCopy({
      userId: order.ownerId,
      type: "CLIENT_ORDER_ACCEPTED",
      title,
      body: this.storeCheckoutBody(order, client),
      entityType: "ORDER",
      entityId: order.id,
      meta: {
        orderNumber: order.orderNumber,
        channel: params.channel,
        deliveryMethod: order.deliveryMethod ?? null,
      },
    });
  }

  private storeCheckoutBody(
    order: {
      totalAmount: number;
      discountAmount: number;
      currency: string | null;
      comment: string | null;
      deliveryMethod: DeliveryMethod | null;
      paymentMethod: PaymentMethod | null;
      paymentType: PaymentType | null;
      deliveryData: unknown;
      items: Array<{
        qty: number;
        productNameSnapshot: string | null;
        product: { name: string } | null;
      }>;
    },
    client: {
      firstName: string | null;
      lastName: string | null;
      phone: string | null;
      region: string | null;
      city: string | null;
    } | null,
  ): string {
    const lines: string[] = [];
    const who = [contactDisplayName(client), client?.phone?.trim()].filter(Boolean).join(" · ");
    if (who) lines.push(who);

    const where = [client?.region?.trim(), client?.city?.trim()].filter(Boolean).join(", ");
    const delivery = [deliveryLabel(order.deliveryMethod), deliveryPlace(order.deliveryData)]
      .filter(Boolean)
      .join(": ");
    const place = [where, delivery].filter(Boolean).join(" · ");
    if (place) lines.push(place);

    const pay = [
      order.paymentType ? PAYMENT_TYPE_LABELS[order.paymentType] ?? order.paymentType : null,
      order.paymentMethod ? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (pay) lines.push(pay);

    const shown = order.items.slice(0, STORE_ITEM_PREVIEW_LIMIT);
    for (const item of shown) {
      const name = item.product?.name?.trim() || item.productNameSnapshot?.trim() || "Товар";
      lines.push(`• ${item.qty} × ${name}`);
    }
    const hidden = order.items.length - shown.length;
    if (hidden > 0) lines.push(`і ще ${hidden}`);

    if (order.discountAmount > 0) {
      lines.push(`Знижка: ${money(order.discountAmount, order.currency)}`);
    }
    lines.push(`Сума: ${money(order.totalAmount, order.currency)}`);

    const comment = order.comment?.trim();
    if (comment) {
      lines.push(comment.length > 180 ? `${comment.slice(0, 180)}…` : comment);
    }
    return lines.join("\n");
  }
}
