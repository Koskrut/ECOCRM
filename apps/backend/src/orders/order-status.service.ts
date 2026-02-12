import { Injectable } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";


@Injectable()
export class OrderStatusService {
  constructor(private readonly prisma: PrismaService) {}

  public async recordInitialStatus(
    orderId: string,
    toStatus: OrderStatus,
    actor: string,
    tx?: PrismaService,
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
    tx?: PrismaService,
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
    tx?: PrismaService;
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
