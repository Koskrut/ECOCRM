import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";
import type { AnalyticsScope } from "../analytics-scope.service";
import { canonicalizeRegionName } from "../../settings/org-chart-region-resolver";
import { buildPaymentPeriodWhere, buildPeriodOrderWhere } from "../utils/analytics-filter.builder";
import type { ResolvedPeriod } from "../utils/analytics-date.util";
import { getBaseCurrency, paymentToBase, safeNum, toBaseCurrency } from "../utils/analytics-currency.util";

@Injectable()
export class AnalyticsDrilldownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async getDrilldown(
    type: string,
    period: ResolvedPeriod,
    scope: AnalyticsScope,
    opts?: { region?: string },
  ) {
    const rates = await this.settings.getExchangeRates();
    const currency = getBaseCurrency(rates);
    const normalizedType = type.trim().toLowerCase();

    if (normalizedType === "payments") {
      const orderOwnerFilter: any = {};
      if (scope.orderScope.managerId) orderOwnerFilter.ownerId = scope.orderScope.managerId;
      else if (scope.orderScope.allowedOwnerIds !== undefined) orderOwnerFilter.ownerId = { in: scope.orderScope.allowedOwnerIds };
      const paymentWhere = buildPaymentPeriodWhere(period.from, period.to, orderOwnerFilter);
      const allRows = await this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          amountUsd: true,
          currency: true,
          paidAt: true,
          order: {
            select: {
              id: true,
              orderNumber: true,
              ownerId: true,
              owner: { select: { fullName: true } },
              client: { select: { firstName: true, lastName: true } },
            },
          },
        },
      });

      let totalAmount = 0;
      for (const p of allRows) {
        totalAmount += paymentToBase(p.amountUsd, p.amount, p.currency, rates);
      }
      const displayRows = allRows.slice(0, 200);

      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
        body: JSON.stringify({
          sessionId: "18e84e",
          runId: "post-fix",
          hypothesisId: "H20",
          location: "analytics-drilldown.service.ts:getDrilldown",
          message: "Payments drilldown result count",
          data: {
            type: normalizedType,
            managerId: scope.orderScope.managerId ?? null,
            allowedOwnerIds: scope.orderScope.allowedOwnerIds ?? null,
            totalCount: allRows.length,
            displayed: displayRows.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      return {
        type: normalizedType,
        currency,
        totalCount: allRows.length,
        totalAmount,
        items: displayRows.map((p) => ({
          id: p.id,
          paidAt: p.paidAt?.toISOString() ?? null,
          amount: paymentToBase(p.amountUsd, p.amount, p.currency, rates),
          currency,
          orderId: p.order.id,
          orderNumber: p.order.orderNumber,
          managerName: p.order.owner?.fullName ?? p.order.ownerId ?? null,
          clientName: p.order.client ? [p.order.client.firstName, p.order.client.lastName].filter(Boolean).join(" ") : null,
        })),
      };
    }

    if (normalizedType === "orders_region") {
      const raw = opts?.region?.trim();
      if (!raw) throw new BadRequestException("region is required for orders_region");
      const canonical = canonicalizeRegionName(raw);
      if (!canonical) throw new BadRequestException("Unknown region");

      const orders = await this.prisma.order.findMany({
        where: {
          ...buildPeriodOrderWhere(period.from, period.to, scope.orderScope),
          clientId: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: {
          id: true,
          orderNumber: true,
          createdAt: true,
          totalAmount: true,
          returnAdjustmentAmount: true,
          debtAmount: true,
          currency: true,
          ownerId: true,
          owner: { select: { fullName: true } },
          client: { select: { firstName: true, lastName: true, region: true } },
        },
      });

      const filtered = orders.filter(
        (o) => canonicalizeRegionName(o.client?.region ?? "") === canonical,
      );

      return {
        type: normalizedType,
        region: canonical,
        currency,
        totalCount: filtered.length,
        items: filtered.slice(0, 200).map((o) => ({
          id: o.id,
          createdAt: o.createdAt.toISOString(),
          orderNumber: o.orderNumber,
          managerName: o.owner?.fullName ?? o.ownerId,
          clientName: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
          bookedRevenue: toBaseCurrency(
            Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
            o.currency,
            rates,
          ),
          debtAmount: toBaseCurrency(safeNum(o.debtAmount), o.currency, rates),
        })),
      };
    }

    const orders = await this.prisma.order.findMany({
      where: buildPeriodOrderWhere(period.from, period.to, scope.orderScope),
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        totalAmount: true,
        returnAdjustmentAmount: true,
        debtAmount: true,
        currency: true,
        ownerId: true,
        owner: { select: { fullName: true } },
        client: { select: { firstName: true, lastName: true } },
      },
    });

    return {
      type: normalizedType,
      currency,
      items: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        orderNumber: o.orderNumber,
        managerName: o.owner?.fullName ?? o.ownerId,
        clientName: o.client ? [o.client.firstName, o.client.lastName].filter(Boolean).join(" ") : null,
        bookedRevenue: toBaseCurrency(
          Math.max(0, safeNum(o.totalAmount) - safeNum(o.returnAdjustmentAmount)),
          o.currency,
          rates,
        ),
        debtAmount: toBaseCurrency(safeNum(o.debtAmount), o.currency, rates),
      })),
    };
  }
}

