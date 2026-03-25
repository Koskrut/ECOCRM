import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

@Injectable()
export class AnalyticsOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperations(period: ResolvedPeriod, scope: AnalyticsScope) {
    if (scope.emptyTeam) {
      return {
        kpi: {
          readyToShip: 0,
          inTransit: 0,
          delivered: 0,
          withTtn: 0,
          withoutTtn: 0,
        },
        byOrderStatus: [],
        byShipmentStatus: [],
      };
    }

    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const ownerFilter = this.toOwnerFilter(scope);

    const [orders, shipments, withTtn, withoutTtn] = await Promise.all([
      this.prisma.order.groupBy({
        by: ["status"],
        where: orderWhere,
        _count: { _all: true },
      }),
      this.prisma.shipment.groupBy({
        by: ["status"],
        where: {
          createdAt: { gte: period.from, lte: period.to },
          order: ownerFilter,
        },
        _count: { _all: true },
      }),
      this.prisma.order.count({
        where: {
          ...orderWhere,
          ttns: { some: {} },
        },
      }),
      this.prisma.order.count({
        where: {
          ...orderWhere,
          ttns: { none: {} },
          status: { in: ["READY_TO_SHIP", "SHIPPED", "CONTROL_PAYMENT", "SUCCESS"] },
        },
      }),
    ]);

    const byOrderStatus = orders
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);
    const byShipmentStatus = shipments
      .map((r) => ({ status: r.status, count: r._count._all }))
      .sort((a, b) => b.count - a.count);

    return {
      kpi: {
        readyToShip: byOrderStatus.find((r) => r.status === "READY_TO_SHIP")?.count ?? 0,
        inTransit: byShipmentStatus.find((r) => r.status === "IN_TRANSIT")?.count ?? 0,
        delivered: byShipmentStatus.find((r) => r.status === "DELIVERED")?.count ?? 0,
        withTtn,
        withoutTtn,
      },
      byOrderStatus,
      byShipmentStatus,
    };
  }

  private toOwnerFilter(scope: AnalyticsScope): Prisma.OrderWhereInput {
    if (scope.orderScope.managerId) {
      return { ownerId: scope.orderScope.managerId };
    }
    if (scope.orderScope.allowedOwnerIds) {
      return { ownerId: { in: scope.orderScope.allowedOwnerIds } };
    }
    return {};
  }
}
