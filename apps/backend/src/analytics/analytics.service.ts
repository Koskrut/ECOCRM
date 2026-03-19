import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

export type AnalyticsMapPeriod = "week" | "month";

/** All Ukrainian oblasts (Bitrix region enum names) for consistent map response. */
const ALL_REGIONS = [
  "Вінницька",
  "Волинська",
  "Дніпропетровська",
  "Донецька",
  "Житомирська",
  "Закарпатська",
  "Запорізька",
  "Івано-Франківська",
  "Київська",
  "Кіровоградська",
  "Луганська",
  "Львівська",
  "Миколаївська",
  "Одеська",
  "Полтавська",
  "Рівненська",
  "Сумська",
  "Тернопільська",
  "Харківська",
  "Херсонська",
  "Хмельницька",
  "Черкаська",
  "Чернівецька",
  "Чернігівська",
];

function getDateRange(period: AnalyticsMapPeriod): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  const days = period === "week" ? 6 : 29;
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export type AnalyticsMapRegionRow = {
  region: string;
  clientsCount: number;
  salesTotal: number;
  managerId: string | null;
  managerName: string | null;
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMapStats(period: AnalyticsMapPeriod, _actor?: AuthUser): Promise<AnalyticsMapRegionRow[]> {
    const { from, to } = getDateRange(period);
    const orderWhere: Prisma.OrderWhereInput = {
      createdAt: { gte: from, lte: to },
      clientId: { not: null },
    };

    const orders = await this.prisma.order.findMany({
      where: orderWhere,
      include: {
        client: { select: { region: true } },
        owner: { select: { id: true, fullName: true } },
      },
    });

    type RegionAgg = {
      clientIds: Set<string>;
      salesTotal: number;
      byOwner: Map<string, { sales: number; name: string }>;
    };
    const byRegion = new Map<string, RegionAgg>();

    for (const o of orders) {
      const region = o.client?.region?.trim() ?? "";
      if (!region) continue;

      let agg = byRegion.get(region);
      if (!agg) {
        agg = { clientIds: new Set(), salesTotal: 0, byOwner: new Map() };
        byRegion.set(region, agg);
      }

      if (o.clientId) agg.clientIds.add(o.clientId);
      const effective = Math.max(0, Number(o.totalAmount ?? 0) - Number(o.returnAdjustmentAmount ?? 0));
      agg.salesTotal += effective;

      if (o.ownerId && o.owner) {
        let ownerAgg = agg.byOwner.get(o.ownerId);
        if (!ownerAgg) {
          ownerAgg = { sales: 0, name: o.owner.fullName };
          agg.byOwner.set(o.ownerId, ownerAgg);
        }
        ownerAgg.sales += effective;
      }
    }

    const result: AnalyticsMapRegionRow[] = ALL_REGIONS.map((region) => {
      const agg = byRegion.get(region);
      if (!agg) {
        return { region, clientsCount: 0, salesTotal: 0, managerId: null, managerName: null };
      }
      let topManagerId: string | null = null;
      let topManagerName: string | null = null;
      let maxSales = 0;
      for (const [ownerId, { sales, name }] of agg.byOwner) {
        if (sales > maxSales) {
          maxSales = sales;
          topManagerId = ownerId;
          topManagerName = name;
        }
      }
      return {
        region,
        clientsCount: agg.clientIds.size,
        salesTotal: Math.round(agg.salesTotal * 100) / 100,
        managerId: topManagerId,
        managerName: topManagerName,
      };
    });

    return result;
  }
}
