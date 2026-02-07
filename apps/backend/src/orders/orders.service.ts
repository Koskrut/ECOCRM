import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaClient, Prisma, OrderStatus } from "@prisma/client";
import { CreateOrderDto } from "./dto/create-order.dto";
// Убрали .entity, так как файл называется order.ts
import { Order } from "./entities/order"; 

type ListOrdersResult = {
  items: Order[];
  total: number;
  page: number;
  pageSize: number;
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaClient) {}

  public async create(dto: CreateOrderDto): Promise<Order> {
    const orderNumber = `ORD-${Date.now()}`;
    const subtotalAmount = 0;
    const discountAmount = dto.discountAmount || 0;
    const totalAmount = Math.max(0, subtotalAmount - discountAmount);

    const createdOrder = await this.prisma.order.create({
      data: {
        orderNumber,
        ownerId: dto.ownerId,
        companyId: dto.companyId || null,
        clientId: dto.clientId || null,
        status: OrderStatus.NEW,
        currency: "UAH",
        subtotalAmount,
        discountAmount,
        totalAmount,
        paidAmount: 0,
        debtAmount: totalAmount,
        comment: dto.comment,
        // Используем 'as any', чтобы TS не ругался на несовпадение типов из разных файлов
        deliveryMethod: (dto.deliveryMethod as any) || null,
        paymentMethod: (dto.paymentMethod as any) || null,
        deliveryData: (dto.deliveryData as any) ?? Prisma.DbNull,
      },
      include: {
        company: true,
        client: true,
        items: { include: { product: true } },
      },
    });

    return this.mapToEntity(createdOrder);
  }

  public async list(
    pagination: { offset: number; limit: number; page: number; pageSize: number },
    filters?: { status?: OrderStatus; search?: string }
  ): Promise<ListOrdersResult> {
    const where: Prisma.OrderWhereInput = {};

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    const [total, orders] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        skip: pagination.offset,
        take: pagination.limit,
        orderBy: { createdAt: "desc" },
        include: {
          company: true,
          client: true,
          items: { include: { product: true } },
        },
      }),
    ]);

    return {
      items: orders.map((o) => this.mapToEntity(o)),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
    };
  }

  public async update(
    id: string,
    dto: {
      companyId?: string | null;
      clientId?: string | null;
      comment?: string | null;
      discountAmount?: number;
    },
  ): Promise<Order> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        items: { include: { product: true } },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const subtotalAmount = existing.items.reduce((sum, i) => sum + (i.lineTotal ?? 0), 0);

      const discountAmount = (dto.discountAmount !== undefined && dto.discountAmount !== null)
        ? Math.max(0, Number(dto.discountAmount))
        : (existing.discountAmount ?? 0);

    const totalAmount = Math.max(0, subtotalAmount - discountAmount);
    const paidAmount = existing.paidAmount ?? 0;
    const debtAmount = Math.max(0, totalAmount - paidAmount);

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        companyId: dto.companyId === undefined ? undefined : dto.companyId,
        clientId: dto.clientId === undefined ? undefined : dto.clientId,
        comment: dto.comment === undefined ? undefined : dto.comment,
        discountAmount,
        subtotalAmount,
        totalAmount,
        debtAmount,
      },
      include: {
        company: true,
        client: true,
        items: { include: { product: true } },
      },
    });

    return this.mapToEntity(updated);
  }



  public async findOne(id: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        items: { include: { product: true } },
      },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return this.mapToEntity(order);
  }

  private mapToEntity(
    raw: Prisma.OrderGetPayload<{
      include: { company: true; client: true; items: { include: { product: true } } };
    }>
  ): Order {
    return {
      id: raw.id,
      orderNumber: raw.orderNumber,
      status: raw.status,
      
      ownerId: raw.ownerId, // <--- ДОБАВЬТЕ ЭТУ СТРОКУ
      
      companyId: raw.companyId ?? undefined,
      company: raw.company ? { id: raw.company.id, name: raw.company.name } : undefined,
      
      clientId: raw.clientId ?? undefined,
      client: raw.client
        ? {
            id: raw.client.id,
            firstName: raw.client.firstName,
            lastName: raw.client.lastName,
            phone: raw.client.phone,
          }
        : undefined,

      currency: raw.currency,
      subtotalAmount: raw.subtotalAmount,
      discountAmount: raw.discountAmount,
      totalAmount: raw.totalAmount,
      paidAmount: raw.paidAmount,
      debtAmount: raw.debtAmount,
      comment: raw.comment ?? undefined,
      deliveryMethod: raw.deliveryMethod as any,
      paymentMethod: raw.paymentMethod as any,
      deliveryData: raw.deliveryData as any,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      items: raw.items.map((i) => ({
        id: i.id,
        productId: i.productId,
        productName: i.product.name,
        qty: i.qty,
        price: i.price,
        lineTotal: i.lineTotal,
      })),
    };
  }
  public async getStatusHistory(orderId: string) {
    return this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }  
  public async updateStatus(
    id: string,
    dto: { toStatus: any; reason?: string },
    actorId: string,
  ): Promise<Order> {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: { company: true, client: true, items: { include: { product: true } } },
    });

    if (!existing) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    // update order status
    const updated = await this.prisma.order.update({
      where: { id },
      data: { status: dto.toStatus },
      include: { company: true, client: true, items: { include: { product: true } } },
    });

    // write status history
    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: existing.status,
        toStatus: dto.toStatus,
        changedBy: actorId,
        reason: dto.reason ?? null,
      },
    });

    return this.mapToEntity(updated);
  }
  public async board(filters?: { search?: string; companyId?: string; ownerId?: string }) {
    const where: Prisma.OrderWhereInput = {};

    if (filters?.search && filters.search.trim().length > 0) {
      where.OR = [{ orderNumber: { contains: filters.search.trim(), mode: "insensitive" } }];
    }
    if (filters?.companyId) where.companyId = filters.companyId;
    if (filters?.ownerId) where.ownerId = filters.ownerId;

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        totalAmount: true,
        currency: true,
        updatedAt: true,
        company: { select: { id: true, name: true } },
        client: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    const columns: Record<string, typeof orders> = {} as any;

    for (const o of orders) {
      const key = o.status;
      if (!columns[key]) columns[key] = [];
      columns[key].push(o);
    }

    // чтобы колонки были всегда (даже пустые)
    for (const st of Object.values(OrderStatus)) {
      const key = String(st);
      if (!columns[key]) columns[key] = [];
    }

    const result = Object.values(OrderStatus).map((st) => {
      const key = String(st);
      return {
        id: key,
        title: key,
        items: columns[key] ?? [],
      };
    });
    
    return result;
    
  }

  public async changeStatus(
    id: string,
    dto: { status: OrderStatus; reason?: string },
    userId: string,
  ): Promise<Order> {
    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Order with ID ${id} not found`);

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.update({
        where: { id },
        data: { status: dto.status },
        include: {
          company: true,
          client: true,
          items: { include: { product: true } },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: existing.status,
          toStatus: dto.status,
          changedBy: userId,
          reason: dto.reason ?? null,
        },
      });

      return order;
    });

    return this.mapToEntity(updated);
  }

  public async addItem(
    id: string,
    dto: { productId: string; qty: number; price: number },
  ) {
    const qty = Number(dto.qty);
    const price = Number(dto.price);
    if (!Number.isFinite(qty) || qty < 1) throw new BadRequestException("Qty must be at least 1");
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException("Price must be 0 or more");

    const existing = await this.prisma.order.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Order with ID  not found`);

    const updated = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const key = { orderId_productId: { orderId: id, productId: dto.productId } };
      const prev = await tx.orderItem.findUnique({ where: key });

      if (prev) {
        const nextQty = prev.qty + qty;
        await tx.orderItem.update({
          where: key,
          data: {
            qty: nextQty,
            price,
            lineTotal: nextQty * price,
          },
        });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: id,
            productId: dto.productId,
            qty,
            price,
            lineTotal: qty * price,
          },
        });
      }

      const sum = await tx.orderItem.aggregate({
        where: { orderId: id },
        _sum: { lineTotal: true },
      });

      const subtotalAmount = Number(sum._sum.lineTotal ?? 0);
      const discountAmount = Number(existing.discountAmount ?? 0);
      const totalAmount = subtotalAmount - discountAmount;
      const paidAmount = Number(existing.paidAmount ?? 0);
      const debtAmount = totalAmount - paidAmount;

      const order = await tx.order.update({
        where: { id },
        data: {
          subtotalAmount,
          totalAmount,
          debtAmount,
        },
        include: {
          company: true,
          client: true,
          items: { include: { product: true } },
        },
      });

      return order;
    });

    return this.mapToEntity(updated as any);
  }
}
