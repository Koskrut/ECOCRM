import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { safeNum, toUsd } from "../utils/analytics-currency.util";

@Injectable()
export class AnalyticsProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getProducts(period: ResolvedPeriod, scope: AnalyticsScope) {
    if (scope.emptyTeam) return { products: [] };
    const rates = await this.settings.getExchangeRates();
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: buildPeriodOrderWhere(period.from, period.to, scope.orderScope),
      },
      select: {
        id: true,
        qty: true,
        price: true,
        productId: true,
        productNameSnapshot: true,
        orderId: true,
        order: { select: { currency: true } },
      },
    });

    const byProduct = new Map<string, { productId: string; productName: string; quantity: number; revenue: number; ordersCount: number }>();
    const seenProductOrderPairs = new Set<string>();
    for (const item of items) {
        const key = item.productId ?? item.productNameSnapshot ?? item.id;
        const cur = byProduct.get(key) ?? {
          productId: item.productId ?? key,
          productName: item.productNameSnapshot ?? item.productId ?? "Unknown",
          quantity: 0,
          revenue: 0,
          ordersCount: 0,
        };
        cur.quantity += safeNum(item.qty);
        cur.revenue += toUsd(safeNum(item.price) * safeNum(item.qty), item.order.currency, rates);
        const pairKey = `${key}:${item.orderId}`;
        if (!seenProductOrderPairs.has(pairKey)) {
          cur.ordersCount += 1;
          seenProductOrderPairs.add(pairKey);
        }
        byProduct.set(key, cur);
    }

    return {
      products: [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 50),
    };
  }
}

