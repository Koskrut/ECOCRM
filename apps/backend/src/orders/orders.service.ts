import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DeliveryMethod, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  private num(v: any, fallback = 0) {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : fallback;
  }

  private calc(subtotal: number, discount: number, paid: number) {
    const s = this.num(subtotal, 0);
    const d = Math.max(0, this.num(discount, 0));
    const p = Math.max(0, this.num(paid, 0));
    const total = Math.max(0, s - d);
    const debt = Math.max(0, total - p);
    return { subtotal: s, discount: d, total, paid: p, debt };
  }

  async list(q: any) {
    const page = Math.max(1, this.num(q?.page, 1));
    const pageSize = Math.min(100, Math.max(1, this.num(q?.pageSize, 20)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};
    if (q?.companyId) where.companyId = String(q.companyId);
    if (q?.clientId) where.clientId = String(q.clientId);
    if (q?.contactId) where.contactId = String(q.contactId);
    if (q?.status) where.status = q.status as OrderStatus;
    if (q?.ownerId) where.ownerId = String(q.ownerId);

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        companyId: o.companyId,
        clientId: o.clientId,
        status: o.status,
        totalAmount: o.totalAmount,
        currency: o.currency,
        createdAt: o.createdAt,
        itemsCount: o.items.length,
      })),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string) {
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
    return this.mapToEntity(o);
  }

  async create(dto: any) {
    const ownerId = dto?.ownerId ? String(dto.ownerId) : null;
    if (!ownerId) throw new BadRequestException("ownerId is required");

    const orderNumber = dto?.orderNumber ? String(dto.orderNumber) : `ORD-${Date.now()}`;

    const currency = dto?.currency ? String(dto.currency) : "UAH";
    const status = (dto?.status as OrderStatus) ?? OrderStatus.NEW;

    const discountAmount = this.num(dto?.discountAmount, 0);
    const paidAmount = this.num(dto?.paidAmount, 0);

    // create with empty items -> subtotal 0
    const a = this.calc(0, discountAmount, paidAmount);

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        companyId: dto?.companyId ?? null,
        clientId: dto?.clientId ?? null,
        contactId: dto?.contactId ?? null,
        ownerId,
        status,
        currency,
        subtotalAmount: a.subtotal,
        discountAmount: a.discount,
        totalAmount: a.total,
        paidAmount: a.paid,
        debtAmount: a.debt,
        comment: dto?.comment ?? null,

        // ✅ IMPORTANT for your UI
        deliveryMethod: (dto?.deliveryMethod as DeliveryMethod) ?? null,
        paymentMethod: (dto?.paymentMethod as PaymentMethod) ?? null,
        deliveryData: dto?.deliveryData ?? null,
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
  }

  async update(id: string, dto: any) {
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
    if ("deliveryData" in dto) data.deliveryData = dto.deliveryData ?? null;

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

  async addItem(orderId: string, dto: any) {
    const productId = String(dto?.productId ?? "");
    const qty = Math.max(1, Math.trunc(this.num(dto?.qty, 1)));
    const price = this.num(dto?.price, 0);

    if (!productId) throw new BadRequestException("productId is required");
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException("price must be >= 0");

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

  async removeItem(orderId: string, itemId: string) {
    await this.prisma.orderItem.delete({ where: { id: itemId } });
    return this.recalcAndReturn(orderId);
  }

  async remove(id: string) {
    await this.prisma.order.delete({ where: { id } });
    return { ok: true };
  }

  async setStatus(id: string, dto: any) {
    const toStatus = dto?.toStatus as OrderStatus;
    const changedBy = dto?.changedBy ? String(dto.changedBy) : "system";
    const reason = dto?.reason ? String(dto.reason) : null;

    if (!toStatus) throw new BadRequestException("toStatus is required");

    const current = await this.prisma.order.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Order not found");

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

  // ✅ OrderModal timeline
  async getTimeline(orderId: string) {
    const exists = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Order not found");

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

  private mapToEntity(o: any) {
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
      comment: o.comment ?? null,

      // ✅ IMPORTANT for UI
      deliveryMethod: o.deliveryMethod ?? null,
      paymentMethod: o.paymentMethod ?? null,
      deliveryData: o.deliveryData ?? null,

      createdAt: o.createdAt,
      updatedAt: o.updatedAt,

      company: o.company ?? null,
      client: o.client ?? null,
      contact: o.contact ?? null,

      items: (o.items ?? []).map((it: any) => ({
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
