import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";

export type ProductsPayload = {
  topByQty: { productId: string; sku: string; name: string; qty: number; revenue: number }[];
  topByRevenue: { productId: string; sku: string; name: string; qty: number; revenue: number }[];
  kitVsPart: { kind: string; count: number; revenue: number }[];
  lowStock: { productId: string; sku: string; name: string; totalQty: number; reserved: number }[];
};

@Injectable()
export class AnalyticsProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProducts(
    period: ResolvedPeriod,
    scope: AnalyticsScope,
  ): Promise<ProductsPayload> {
    if (scope.emptyTeam) {
      return { topByQty: [], topByRevenue: [], kitVsPart: [], lowStock: [] };
    }

    const orderWhere = buildPeriodOrderWhere(period.from, period.to, scope.orderScope);
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: orderWhere,
        productId: { not: null },
      },
      select: {
        qty: true,
        lineTotal: true,
        productId: true,
        product: { select: { sku: true, name: true, kind: true } },
      },
    });

    const byProduct = new Map<
      string,
      { sku: string; name: string; kind: string; qty: number; revenue: number }
    >();
    const byKind = new Map<string, { count: number; revenue: number }>();

    for (const it of items) {
      if (!it.productId || !it.product) continue;
      const pid = it.productId;
      const cur = byProduct.get(pid) ?? {
        sku: it.product.sku,
        name: it.product.name,
        kind: it.product.kind,
        qty: 0,
        revenue: 0,
      };
      cur.qty += it.qty;
      cur.revenue += Number(it.lineTotal ?? 0);
      byProduct.set(pid, cur);

      const k = it.product.kind;
      const kc = byKind.get(k) ?? { count: 0, revenue: 0 };
      kc.count += it.qty;
      kc.revenue += Number(it.lineTotal ?? 0);
      byKind.set(k, kc);
    }

    const list = [...byProduct.entries()].map(([productId, v]) => ({
      productId,
      sku: v.sku,
      name: v.name,
      qty: v.qty,
      revenue: v.revenue,
    }));

    const topByQty = [...list].sort((a, b) => b.qty - a.qty).slice(0, 20);
    const topByRevenue = [...list].sort((a, b) => b.revenue - a.revenue).slice(0, 20);
    const kitVsPart = [...byKind.entries()].map(([kind, v]) => ({
      kind,
      count: v.count,
      revenue: v.revenue,
    }));

    const stockRows = await this.prisma.productWarehouseStock.groupBy({
      by: ["productId"],
      _sum: { qty: true },
    });
    const reservedRows = await this.prisma.materialReservation.groupBy({
      by: ["productId"],
      where: { status: "ACTIVE" },
      _sum: { qty: true },
    });
    const resMap = new Map(reservedRows.map((r) => [r.productId, Number(r._sum.qty ?? 0)]));

    const lowStock: ProductsPayload["lowStock"] = [];
    const threshold = 5;
    const lowIds: { productId: string; totalQty: number; reserved: number }[] = [];
    for (const s of stockRows) {
      const totalQty = Number(s._sum.qty ?? 0);
      const reserved = resMap.get(s.productId) ?? 0;
      if (totalQty - reserved < threshold) {
        lowIds.push({ productId: s.productId, totalQty, reserved });
      }
    }
    const products = await this.prisma.product.findMany({
      where: { id: { in: lowIds.map((x) => x.productId) } },
      select: { id: true, sku: true, name: true },
    });
    const pmap = new Map(products.map((p) => [p.id, p]));
    for (const row of lowIds) {
      const p = pmap.get(row.productId);
      if (p) {
        lowStock.push({
          productId: row.productId,
          sku: p.sku,
          name: p.name,
          totalQty: row.totalQty,
          reserved: row.reserved,
        });
      }
    }
    lowStock.sort((a, b) => a.totalQty - b.totalQty);
    const lowStockTop = lowStock.slice(0, 30);

    return {
      topByQty,
      topByRevenue,
      kitVsPart,
      lowStock: lowStockTop,
    };
  }
}
