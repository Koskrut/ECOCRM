import { Injectable, NotFoundException } from "@nestjs/common";
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
}