/* eslint-disable @typescript-eslint/consistent-type-imports -- Nest DI tokens must be value imports */
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { TimelineEntityType, TimelineItem } from "../timeline.types";
import type { TimelineAdapter, TimelineFetchArgs } from "./timeline-adapter";

@Injectable()
export class TtnTimelineAdapter implements TimelineAdapter {
  constructor(private readonly prisma: PrismaService) {}

  supports(entityType: TimelineEntityType): boolean {
    return entityType === "order";
  }

  async fetch(args: TimelineFetchArgs): Promise<TimelineItem[]> {
    if (!this.supports(args.entityType)) return [];
    const { entityId, cursorAt, limit } = args;
    const where: Prisma.OrderTtnWhereInput = {
      OR: [{ orderId: entityId }, { shipment: { is: { orderId: entityId } } }],
    };
    if (cursorAt) where.createdAt = { lt: cursorAt };
    const rows = await this.prisma.orderTtn.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: `ttn:${row.id}`,
      source: "ttn",
      kind: "shipment",
      entity: { type: args.entityType, id: args.entityId },
      title: `TTN ${row.documentNumber}`,
      body: row.statusText ?? "",
      at: row.createdAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      pinnedAt: null,
      actor: { id: null, name: "system" },
      canEdit: false,
      canDelete: false,
      canPin: false,
      meta: {
        kind: "shipment",
        data: {
          documentNumber: row.documentNumber,
          statusCode: row.statusCode ?? null,
          statusText: row.statusText ?? null,
          carrier: row.carrier ?? null,
          cost: typeof row.cost === "number" ? row.cost : null,
        },
      },
    } satisfies TimelineItem));
  }
}
