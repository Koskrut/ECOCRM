import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Pagination } from "../common/pagination";
import { ProductStore } from "../products/product.store";
import { AddOrderItemDto } from "./dto/add-order-item.dto";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { UpdateOrderItemDto } from "./dto/update-order-item.dto";
import { Order, OrderSummary } from "./entities/order";
import { OrderItem } from "./entities/order-item";
import { OrderStatusService } from "./order-status.service";
import { createOrderNumber } from "../common/ids";

type ListOrdersResult = {
  items: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class OrdersService {
  private readonly productStore: ProductStore;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly statusService: OrderStatusService,
  ) {
    this.productStore = new ProductStore(prisma);
  }

  async createOrder(dto: CreateOrderDto): Promise<Order> {
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber: `ORD-${Date.now()}`,
          ownerId: dto.ownerId,
          companyId: dto.companyId ?? null,
          clientId: dto.clientId ?? null,
          status: "NEW",
          currency: "UAH",
          subtotalAmount: 0,
          discountAmount: dto.discountAmount ?? 0,
          totalAmount: 0,
          paidAmount: 0,
          debtAmount: 0,
          comment: dto.comment ?? null,
        },
      });

      await this.statusService.recordInitialStatus(
        created.id,
        created.status,
        dto.ownerId,
        tx,
      );

      return created;
    });

    return {
      ...order,
      comment: order.comment ?? undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: [],
    };
  }

  async listOrders(pagination: Pagination): Promise<ListOrdersResult> {
    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.order.findMany({
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { items: true } },
        },
      }),
    ]);

    const items = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      companyId: order.companyId,
      clientId: order.clientId,
      ownerId: order.ownerId,
      status: order.status,
      currency: order.currency,
      subtotalAmount: order.subtotalAmount,
      discountAmount: order.discountAmount,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      debtAmount: order.debtAmount,
      comment: order.comment ?? undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      itemsCount: order._count.items,
    }));

    return {
      items,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        company: true,
        client: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return {
      ...order,
      comment: order.comment ?? undefined,
      company: order.company
        ? {
            id: order.company.id,
            name: order.company.name,
          }
        : undefined,
      client: order.client
        ? {
            id: order.client.id,
            firstName: order.client.firstName,
            lastName: order.client.lastName,
            phone: order.client.phone,
          }
        : undefined,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      items: order.items.map((item) => ({
        ...item,
        product: item.product
          ? {
              id: item.product.id,
              sku: item.product.sku,
              name: item.product.name,
              unit: item.product.unit,
            }
          : undefined,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async addItem(orderId: string, dto: AddOrderItemDto): Promise<OrderItem> {
    const product = await this.productStore.findActiveById(dto.productId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }

    const item = await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.upsert({
        where: {
          orderId_productId: {
            orderId,
            productId: dto.productId,
          },
        },
        create: {
          orderId,
          productId: dto.productId,
          qty: dto.qty,
          price: dto.price,
          lineTotal: dto.qty * dto.price,
        },
        update: {
          qty: { increment: dto.qty },
        },
      });

      const updated = await tx.orderItem.findUnique({
        where: {
          orderId_productId: {
            orderId,
            productId: dto.productId,
          },
        },
      });

      if (!updated) {
        throw new NotFoundException("Order item not found");
      }

      const saved = await tx.orderItem.update({
        where: { id: updated.id },
        data: {
          lineTotal: updated.qty * updated.price,
        },
      });

      await this.recalculateTotals(orderId, tx);
      return saved;
    });

    return {
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async updateItem(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemDto,
  ): Promise<OrderItem> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });

    if (!item) {
      throw new NotFoundException("Order item not found");
    }

    const qty = dto.qty ?? item.qty;
    const price = dto.price ?? item.price;

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.orderItem.update({
        where: { id: itemId },
        data: {
          qty,
          price,
          lineTotal: qty * price,
        },
      });

      await this.recalculateTotals(orderId, tx);
      return saved;
    });

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async removeItem(orderId: string, itemId: string): Promise<void> {
    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });

    if (!item) {
      throw new NotFoundException("Order item not found");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: itemId } });
      await this.recalculateTotals(orderId, tx);
    });
  }

  private async recalculateTotals(
    orderId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const [order, aggregate] = await Promise.all([
      tx.order.findUnique({ where: { id: orderId } }),
      tx.orderItem.aggregate({
        where: { orderId },
        _sum: { lineTotal: true },
      }),
    ]);

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const subtotal = aggregate._sum.lineTotal ?? 0;
    const totalAmount = Math.max(subtotal - order.discountAmount, 0);
    const debtAmount = Math.max(totalAmount - order.paidAmount, 0);

    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalAmount: subtotal,
        totalAmount,
        debtAmount,
      },
    });
  }

  async updateOrder(orderId: string, dto: UpdateOrderDto): Promise<Order> {
    // Validate that order exists
    const existingOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!existingOrder) {
      throw new NotFoundException("Order not found");
    }

    // Validate companyId exists (if provided)
    if (dto.companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
      });
      if (!company) {
        throw new BadRequestException("Company not found");
      }
    }

    // Validate clientId exists (if provided)
    if (dto.clientId !== undefined) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: dto.clientId },
      });
      if (!contact) {
        throw new BadRequestException("Contact not found");
      }

      // Validate client.companyId === order.companyId (if both are set)
      const targetCompanyId = dto.companyId !== undefined ? dto.companyId : existingOrder.companyId;
      if (targetCompanyId && contact.companyId && contact.companyId !== targetCompanyId) {
        throw new BadRequestException("Contact must belong to the same company as the order");
      }
    }

    // Update order
    const needsRecalculation = dto.discountAmount !== undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          companyId: dto.companyId,
          clientId: dto.clientId,
          comment: dto.comment,
          discountAmount: dto.discountAmount,
        },
      });

      // Recalculate totals if discount changed
      if (needsRecalculation) {
        await this.recalculateTotals(orderId, tx);
      }
    });

    // Return updated order
    return this.getOrder(orderId);
  }
}
