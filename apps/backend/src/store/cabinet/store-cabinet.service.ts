import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class StoreCabinetService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        customer: { select: { id: true, email: true, createdAt: true } },
        telegramAccounts: { select: { id: true, username: true } },
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (!contact.customer) throw new ForbiddenException("Customer account not found");
    return {
      contactId: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName,
      phone: contact.phone,
      email: contact.customer.email,
      telegramLinked: contact.telegramAccounts.length > 0,
      telegramUsername: contact.telegramAccounts[0]?.username ?? null,
    };
  }

  async updateMe(
    contactId: string,
    dto: { firstName?: string; lastName?: string; email?: string | null },
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: { customer: { select: { id: true } } },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    if (!contact.customer) throw new ForbiddenException("Customer account not found");

    const contactData: { firstName?: string; lastName?: string } = {};
    if (dto.firstName !== undefined) contactData.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) contactData.lastName = dto.lastName.trim();

    const customerData: { email?: string | null } = {};
    if (dto.email !== undefined) customerData.email = dto.email?.trim() || null;

    await this.prisma.$transaction([
      ...(Object.keys(contactData).length > 0
        ? [
            this.prisma.contact.update({
              where: { id: contactId },
              data: contactData,
            }),
          ]
        : []),
      ...(Object.keys(customerData).length > 0
        ? [
            this.prisma.customer.update({
              where: { id: contact.customer.id },
              data: customerData,
            }),
          ]
        : []),
    ]);

    return this.getMe(contactId);
  }

  async getOrders(contactId: string, page = 1, pageSize = 50) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize));
    const take = Math.min(100, Math.max(1, pageSize));
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { clientId: contactId },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          debtAmount: true,
          deliveryMethod: true,
          paymentMethod: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({ where: { clientId: contactId } }),
    ]);
    return {
      items: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        paidAmount: o.paidAmount,
        debtAmount: o.debtAmount,
        deliveryMethod: o.deliveryMethod,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt,
      })),
      total,
      page,
      pageSize: take,
    };
  }

  async getOrderById(contactId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId: contactId },
      include: {
        items: { include: { product: { select: { sku: true, name: true, unit: true } } } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      debtAmount: order.debtAmount,
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      deliveryData: order.deliveryData,
      comment: order.comment,
      createdAt: order.createdAt,
      items: order.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        sku: i.product?.sku ?? null,
        name: i.product?.name ?? i.productNameSnapshot ?? "",
        unit: i.product?.unit ?? "",
        qty: i.qty,
        price: i.price,
        lineTotal: i.lineTotal,
      })),
    };
  }

  async getPayments(contactId: string, page = 1, pageSize = 50) {
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize));
    const take = Math.min(100, Math.max(1, pageSize));
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { contactId },
        orderBy: { paidAt: "desc" },
        skip,
        take,
        include: { order: { select: { orderNumber: true } } },
      }),
      this.prisma.payment.count({ where: { contactId } }),
    ]);
    return {
      items: items.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        orderNumber: p.order?.orderNumber ?? null,
        amount: Number(p.amount),
        currency: p.currency,
        paidAt: p.paidAt,
        status: p.status,
      })),
      total,
      page,
      pageSize: take,
    };
  }
}
