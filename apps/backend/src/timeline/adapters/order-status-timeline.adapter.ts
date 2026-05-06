/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { Injectable } from "@nestjs/common";
import type { OrderStatusHistory, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { TimelineEntityType, TimelineItem } from "../timeline.types";
import type { TimelineAdapter, TimelineFetchArgs } from "./timeline-adapter";

@Injectable()
export class OrderStatusTimelineAdapter implements TimelineAdapter {
  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: TimelineEntityType): boolean {
    return entityType === "order";
  }

  async fetch(args: TimelineFetchArgs): Promise<TimelineItem[]> {
    if (!this.supports(args.entityType)) return [];
    const { entityId, cursorAt, limit } = args;
    const where: Prisma.OrderStatusHistoryWhereInput = { orderId: entityId };
    if (cursorAt) where.createdAt = { lt: cursorAt };
    const rows = await this.prisma.orderStatusHistory.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) return [];
    return this.attachActorNames(rows, args);
  }

  private async attachActorNames(
    rows: OrderStatusHistory[],
    args: TimelineFetchArgs,
  ): Promise<TimelineItem[]> {
    const ids = [...new Set(rows.map((r) => r.changedBy).filter((v): v is string => Boolean(v)))];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, fullName: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.fullName] as const));

    return rows.map((row) => {
      const fromStage = row.fromOrderStage ?? null;
      const toStage = row.toOrderStage ?? null;
      const titlePart = toStage ?? row.toStatus;
      const fromPart = fromStage ?? row.fromStatus ?? null;
      const title = fromPart ? `${fromPart} → ${titlePart}` : `→ ${titlePart}`;
      return {
        id: `status:${row.id}`,
        source: "order_status",
        kind: "status_change",
        entity: { type: args.entityType, id: args.entityId },
        title,
        body: row.reason ?? "",
        at: row.createdAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        pinnedAt: null,
        actor: {
          id: row.changedBy ?? null,
          name: row.changedBy ? (nameById.get(row.changedBy) ?? row.changedBy) : "system",
        },
        canEdit: false,
        canDelete: false,
        canPin: false,
        meta: {
          kind: "status",
          data: {
            fromStage,
            toStage,
            fromStatus: row.fromStatus ?? null,
            toStatus: row.toStatus,
          },
        },
      } satisfies TimelineItem;
    });
  }
}
