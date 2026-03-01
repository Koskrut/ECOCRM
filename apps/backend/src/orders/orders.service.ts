import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import type { DeliveryMethod, PaymentMethod, PaymentType, Prisma } from "@prisma/client";
import { OrderPaymentStatus, OrderStatus, UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import type { UpdateOrderDto } from "./dto/update-order.dto";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private num(v: unknown, fallback = 0) {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : fallback;
  }

  /** MANAGER может работать только с заказами, где ownerId === actor.id. ADMIN и LEAD — полный доступ. */
  private assertOrderAccess(order: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private calc(subtotal: number, discount: number, paid: number) {
    const s = this.num(subtotal, 0);
    const d = Math.max(0, this.num(discount, 0));
    const p = Math.max(0, this.num(paid, 0));
    const total = Math.max(0, s - d);
    const debt = Math.max(0, total - p);
    return { subtotal: s, discount: d, total, paid: p, debt };
  }

  async list(q: ListOrdersQueryDto, actor?: AuthUser) {
    const page = Math.max(1, this.num(q?.page, 1));
    const pageSize = Math.min(100, Math.max(1, this.num(q?.pageSize, 20)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};
    if (q?.companyId) where.companyId = String(q.companyId);
    if (q?.clientId) where.clientId = String(q.clientId);
    if (q?.contactId) where.contactId = String(q.contactId);
    if (q?.board === true) {
      where.status = { notIn: [OrderStatus.SUCCESS, OrderStatus.CANCELED, OrderStatus.RETURNING] };
    } else if (q?.status) {
      where.status = q.status as OrderStatus;
    }
    if (q?.ownerId) where.ownerId = String(q.ownerId);
    if (actor?.role === UserRole.MANAGER) where.ownerId = actor.id;

    const withRelations = q?.withCompanyClient === true;
    const include: Prisma.OrderInclude = { items: true };
    if (withRelations) {
      include.company = true;
      include.client = true;
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o) => {
        const paidAmount = o.paidAmount ?? 0;
        const totalAmount = o.totalAmount ?? 0;
        const base = {
          id: o.id,
          orderNumber: o.orderNumber,
          companyId: o.companyId,
          clientId: o.clientId,
          status: o.status,
          totalAmount: o.totalAmount,
          paidAmount: o.paidAmount,
          debtAmount: o.debtAmount,
          paymentStatus: this.calcPaymentStatus(paidAmount, totalAmount),
          currency: o.currency,
          paymentType: o.paymentType,
          createdAt: o.createdAt,
          itemsCount: o.items.length,
        };
        if (withRelations && "company" in o && "client" in o) {
          return {
            ...base,
            company: o.company ? { id: o.company.id, name: o.company.name } : null,
            client: o.client
              ? {
                  id: o.client.id,
                  firstName: o.client.firstName,
                  lastName: o.client.lastName,
                }
              : null,
          };
        }
        return base;
      }),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string, actor?: AuthUser) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!o) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(o, actor);
    return this.mapToEntity(o);
  }

  async create(dto: CreateOrderDto, actor?: AuthUser) {
    // When authenticated, use current user as owner; otherwise require body (e.g. API).
    const ownerId = actor?.id ?? dto.ownerId ?? undefined;
    if (!ownerId) throw new BadRequestException("ownerId is required");
    const orderNumber = `ORD-${Date.now()}`;
    const currency = "UAH";
    const status = OrderStatus.NEW;
    const discountAmount = this.num(dto.discountAmount, 0);
    const paidAmount = 0;

    const a = this.calc(0, discountAmount, paidAmount);

    try {
      const order = await this.prisma.order.create({
        data: {
          orderNumber,
          companyId: dto.companyId ?? null,
          clientId: dto.clientId ?? null,
          contactId: dto.contactId ?? null,
          ownerId,
          status,
          currency,
          subtotalAmount: a.subtotal,
          discountAmount: a.discount,
          totalAmount: a.total,
          paidAmount: a.paid,
          debtAmount: a.debt,
          comment: dto.comment ?? null,
          deliveryMethod: dto.deliveryMethod ?? null,
          paymentMethod: dto.paymentMethod ?? null,
          paymentType: dto.paymentType ?? null,
          deliveryData: (dto.deliveryData ?? undefined) as Prisma.InputJsonValue | undefined,
        },
        include: {
          company: true,
          client: true,
          contact: true,
          items: { include: { product: true } },
          ttns: true,
        },
      });

      return this.mapToEntity(order);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Order create failed: ${msg}`);
    }
  }

  async update(id: string, dto: UpdateOrderDto, actor?: AuthUser) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: true,
      },
    });
    if (!existing) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(existing, actor);

    const data: Prisma.OrderUpdateInput = {};

    // relations
    // FK поля в Prisma "checked update" нельзя писать напрямую (companyId/clientId/contactId),
    // поэтому обновляем через relation-операции connect/disconnect.
    if ("companyId" in dto) {
      data.company = dto.companyId ? { connect: { id: dto.companyId } } : { disconnect: true };
    }

    if ("clientId" in dto) {
      data.client = dto.clientId ? { connect: { id: dto.clientId } } : { disconnect: true };
    }

    if ("contactId" in dto) {
      data.contact = dto.contactId ? { connect: { id: dto.contactId } } : { disconnect: true };
    }

    // misc
    if ("comment" in dto) data.comment = dto.comment ? String(dto.comment) : null;

    // ✅ delivery/payment (was missing -> UI looked like it "reverts")
    if ("deliveryMethod" in dto)
      data.deliveryMethod = (dto.deliveryMethod as DeliveryMethod) ?? null;
    if ("paymentMethod" in dto) data.paymentMethod = (dto.paymentMethod as PaymentMethod) ?? null;
    if ("paymentType" in dto) data.paymentType = (dto.paymentType as PaymentType) ?? null;
    if ("deliveryData" in dto)
      data.deliveryData = (dto.deliveryData ?? undefined) as Prisma.InputJsonValue | undefined;

    // amounts
    const nextDiscount =
      "discountAmount" in dto ? this.num(dto.discountAmount, 0) : existing.discountAmount;
    const nextPaid = "paidAmount" in dto ? this.num(dto.paidAmount, 0) : existing.paidAmount;
    const a = this.calc(existing.subtotalAmount, nextDiscount, nextPaid);

    if ("discountAmount" in dto) data.discountAmount = a.discount;
    if ("paidAmount" in dto) data.paidAmount = a.paid;

    // keep totals consistent
    if ("discountAmount" in dto || "paidAmount" in dto) {
      data.totalAmount = a.total;
      data.debtAmount = a.debt;
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: { orderBy: { createdAt: "desc" } },
      },
    });

    return this.mapToEntity(updated);
  }

  async addItem(orderId: string, dto: AddOrderItemDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const productId = dto.productId;
    const qty = Math.max(1, Math.trunc(dto.qty));
    const price = dto.price;

    const existing = await this.prisma.orderItem.findUnique({
      where: { orderId_productId: { orderId, productId } },
    });

    if (existing) {
      await this.prisma.orderItem.update({
        where: { id: existing.id },
        data: {
          qty: existing.qty + qty,
          price,
          lineTotal: (existing.qty + qty) * price,
        },
      });
    } else {
      await this.prisma.orderItem.create({
        data: {
          orderId,
          productId,
          qty,
          price,
          lineTotal: qty * price,
        },
      });
    }

    return this.recalcAndReturn(orderId);
  }

  async updateItem(
    orderId: string,
    itemId: string,
    dto: { qty?: number; price?: number },
    actor?: AuthUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException("Order item not found");

    const nextQty = dto.qty != null ? Math.max(1, Math.trunc(dto.qty)) : item.qty;
    const nextPrice = dto.price != null ? dto.price : item.price;

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        qty: nextQty,
        price: nextPrice,
        lineTotal: nextQty * nextPrice,
      },
    });

    return this.recalcAndReturn(orderId);
  }

  async removeItem(orderId: string, itemId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException("Order item not found");

    await this.prisma.orderItem.delete({ where: { id: itemId } });
    return this.recalcAndReturn(orderId);
  }

  async remove(id: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);
    await this.prisma.order.delete({ where: { id } });
    return { ok: true };
  }

  async setStatus(
    id: string,
    dto: { toStatus: OrderStatus; reason?: string | null; changedBy: string },
    actor?: AuthUser,
  ) {
    const toStatus = dto.toStatus;
    const changedBy = dto.changedBy;
    const reason = dto.reason ?? null;

    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(current, actor);

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: current.status,
        toStatus,
        changedBy,
        reason,
      },
    });

    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: toStatus },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: { orderBy: { createdAt: "desc" } },
      },
    });

    return this.mapToEntity(updated);
  }

  async getTimeline(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const [history, activities, ttns] = await Promise.all([
      this.prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activity.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.orderTtn.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const items = [
      ...history.map((h) => ({
        id: h.id,
        type: "STATUS",
        at: h.createdAt,
        title: `Status → ${h.toStatus}`,
        body: h.reason ?? null,
        meta: { from: h.fromStatus, to: h.toStatus, changedBy: h.changedBy },
      })),
      ...activities.map((a) => ({
        id: a.id,
        type: "ACTIVITY",
        at: a.occurredAt ?? a.createdAt,
        title: a.title ?? a.type,
        body: a.body,
        meta: { activityType: a.type, createdBy: a.createdBy },
      })),
      ...ttns.map((t) => ({
        id: t.id,
        type: "TTN",
        at: t.createdAt,
        title: `TTN ${t.documentNumber}`,
        body: t.statusText ?? null,
        meta: { statusCode: t.statusCode, carrier: t.carrier, cost: t.cost },
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { items };
  }

  private async recalcAndReturn(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    const subtotal = order.items.reduce((sum, it) => sum + (it.lineTotal ?? 0), 0);
    const a = this.calc(subtotal, order.discountAmount, order.paidAmount);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalAmount: a.subtotal,
        totalAmount: a.total,
        debtAmount: a.debt,
      },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: { orderBy: { createdAt: "desc" } },
      },
    });

    return this.mapToEntity(updated);
  }

  private calcPaymentStatus(paidAmount: number, totalAmount: number): OrderPaymentStatus {
    const paid = Number(paidAmount) || 0;
    const total = Number(totalAmount) || 0;
    if (paid <= 0) return OrderPaymentStatus.UNPAID;
    if (paid >= total) return paid > total ? OrderPaymentStatus.OVERPAID : OrderPaymentStatus.PAID;
    return OrderPaymentStatus.PARTIALLY_PAID;
  }

  private mapToEntity(o: Record<string, unknown>) {
    const items = (o.items as Array<Record<string, unknown>> | undefined) ?? [];
    const paidAmount = Number(o.paidAmount) ?? 0;
    const totalAmount = Number(o.totalAmount) ?? 0;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      companyId: o.companyId ?? null,
      clientId: o.clientId ?? null,
      contactId: o.contactId ?? null,
      ownerId: o.ownerId ?? null,
      status: o.status,
      currency: o.currency,
      subtotalAmount: o.subtotalAmount,
      discountAmount: o.discountAmount,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      debtAmount: o.debtAmount,
      paymentStatus: this.calcPaymentStatus(paidAmount, totalAmount),
      comment: o.comment ?? null,
      deliveryMethod: o.deliveryMethod ?? null,
      paymentMethod: o.paymentMethod ?? null,
      paymentType: o.paymentType ?? null,
      deliveryData: o.deliveryData ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      company: o.company ?? null,
      client: o.client ?? null,
      contact: o.contact ?? null,
      items: items.map((it) => ({
        id: it.id,
        productId: it.productId,
        qty: it.qty,
        price: it.price,
        lineTotal: it.lineTotal,
        product: it.product ?? null,
      })),
      ttns: o.ttns ?? [],
    };
  }
}
