import { Injectable, NotFoundException } from "@nestjs/common";
import type { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrderStatusService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Удобный метод для контроллера:
   * - сам получает текущий статус
   * - делает update + запись истории в транзакции
   * - возвращает обновлённый заказ
   */
  public async setStatus(orderId: string, toStatus: OrderStatus, actor: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, status: true },
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      const fromStatus = order.status;

      await this.changeStatus(orderId, toStatus, actor, fromStatus, reason, tx);

      // вернем обновлённый заказ (можно расширить include/select если надо)
      return tx.order.findUnique({ where: { id: orderId } });
    });
  }

  public async recordInitialStatus(
    orderId: string,
    toStatus: OrderStatus,
    actor: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.writeHistory({
      orderId,
      fromStatus: null,
      toStatus,
      actor,
      tx,
    });
  }

  public async changeStatus(
    orderId: string,
    toStatus: OrderStatus,
    actor: string,
    fromStatus: OrderStatus,
    reason?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;

    await client.order.update({
      where: { id: orderId },
      data: { status: toStatus },
    });

    await this.writeHistory({
      orderId,
      fromStatus,
      toStatus,
      actor,
      reason,
      tx: client,
    });
  }

  private async writeHistory(params: {
    orderId: string;
    fromStatus: OrderStatus | null;
    toStatus: OrderStatus;
    actor: string;
    reason?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const client = params.tx ?? this.prisma;

    await client.orderStatusHistory.create({
      data: {
        orderId: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        changedBy: params.actor,
        reason: params.reason,
      },
    });
  }
}
