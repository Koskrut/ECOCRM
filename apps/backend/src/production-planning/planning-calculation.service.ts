import { Injectable } from "@nestjs/common";
import {
  InventorySnapshotStatus,
  ProductionBatchStatus,
  ReservationHardness,
  ReservationStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DemandRulesService } from "./demand-rules.service";

@Injectable()
export class PlanningCalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandRules: DemandRulesService,
  ) {}

  async getAvailability(productId: string, warehouseId?: string) {
    const postedSnapshot = await this.prisma.inventorySnapshot.findFirst({
      where: { status: InventorySnapshotStatus.POSTED },
      orderBy: { postedAt: "desc" },
      select: { id: true, postedAt: true },
    });

    const lineWhere = {
      snapshotId: postedSnapshot?.id,
      productId,
      ...(warehouseId ? { warehouseId } : {}),
    };
    const [stockAgg, hardAgg, softAgg, wipAgg] = await Promise.all([
      this.prisma.inventorySnapshotLine.aggregate({
        where: lineWhere,
        _sum: { qty: true },
      }),
      this.prisma.materialReservation.aggregate({
        where: {
          productId,
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.HARD,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { qty: true },
      }),
      this.prisma.materialReservation.aggregate({
        where: {
          productId,
          status: ReservationStatus.ACTIVE,
          hardness: ReservationHardness.SOFT,
          ...(warehouseId ? { warehouseId } : {}),
        },
        _sum: { qty: true },
      }),
      this.prisma.productionBatch.aggregate({
        where: {
          productId,
          status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
        },
        _sum: { qtyPlanned: true, qtyGood: true },
      }),
    ]);

    const physical = stockAgg._sum.qty ?? 0;
    const hardReserved = hardAgg._sum.qty ?? 0;
    const softReserved = softAgg._sum.qty ?? 0;
    const available = Math.max(0, physical - hardReserved);
    const expectedOutput = Math.max(0, (wipAgg._sum.qtyPlanned ?? 0) - (wipAgg._sum.qtyGood ?? 0));

    return {
      asOfSnapshotId: postedSnapshot?.id ?? null,
      asOfSnapshotDate: postedSnapshot?.postedAt ?? null,
      productId,
      warehouseId: warehouseId ?? null,
      physical,
      hardReserved,
      softReserved,
      available,
      expectedOutput,
    };
  }

  async getKitCapacity(kitProductId: string) {
    const bom = await this.prisma.kitBom.findFirst({
      where: { kitProductId, isActive: true },
      include: { lines: true },
      orderBy: [{ effectiveFrom: "desc" }, { revision: "desc" }],
    });
    if (!bom || bom.lines.length === 0) {
      return { kitProductId, maxBuildNow: 0, bottleneckComponentId: null, components: [] as unknown[] };
    }

    const components = [];
    for (const line of bom.lines) {
      const availability = await this.getAvailability(line.componentProductId);
      const ratio = line.qtyPerKit.toNumber() > 0 ? availability.available / line.qtyPerKit.toNumber() : 0;
      components.push({
        componentProductId: line.componentProductId,
        qtyPerKit: line.qtyPerKit.toNumber(),
        available: availability.available,
        ratio,
      });
    }
    components.sort((a, b) => a.ratio - b.ratio);
    const bottleneck = components[0] ?? null;
    return {
      kitProductId,
      maxBuildNow: bottleneck ? Math.max(0, Math.floor(bottleneck.ratio)) : 0,
      bottleneckComponentId: bottleneck?.componentProductId ?? null,
      components,
    };
  }

  async getLaunchRecommendations(horizonWeeks = 1) {
    const rules = await this.demandRules.getRules();
    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + horizonWeeks * 7);

    const demandRows = await this.prisma.orderItem.findMany({
      where: {
        order: {
          createdAt: { lte: until },
          orderStage: {
            in: [...rules.hardStages, ...rules.softStages],
            notIn: ["CANCELED", "REFUSED", "COMPLETED"],
          },
        },
      },
      include: { order: { select: { id: true, orderStage: true } } },
    });

    const demandByProduct = new Map<string, { hard: number; soft: number }>();
    const unresolvedOrderItemIds: string[] = [];

    for (const row of demandRows) {
      if (!row.productId) {
        if (rules.includeOrderItemsWithoutProductIdAsSoft) unresolvedOrderItemIds.push(row.id);
        continue;
      }
      const current = demandByProduct.get(row.productId) ?? { hard: 0, soft: 0 };
      const isHard = row.order.orderStage && rules.hardStages.includes(row.order.orderStage);
      const remainingQty = Math.max(0, row.qty - row.qtyShipped);
      if (isHard) current.hard += remainingQty;
      else current.soft += remainingQty;
      demandByProduct.set(row.productId, current);
    }

    const recommendations = [];
    for (const [productId, demand] of demandByProduct.entries()) {
      const availability = await this.getAvailability(productId);
      const hardNeed = demand.hard;
      const deficit = Math.max(0, hardNeed - availability.available - availability.expectedOutput);
      if (deficit > 0) {
        recommendations.push({
          productId,
          hardNeed,
          softNeed: demand.soft,
          available: availability.available,
          expectedOutput: availability.expectedOutput,
          deficit,
          suggestedLaunchQty: deficit,
          reason: "Hard demand exceeds available stock + expected output",
          horizonWeeks,
        });
      }
    }

    recommendations.sort((a, b) => b.deficit - a.deficit);
    return { horizonWeeks, unresolvedOrderItemIds, recommendations };
  }
}

