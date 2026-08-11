import { Injectable } from "@nestjs/common";
import { OrderStage, PlanningRunLineType, ProductKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { FactoryOrderService } from "./factory-order.service";
import { computeDesiredDate } from "./mrp-desired-date.util";
import {
  groupAwaitingStockLines,
  type TodayAwaitingStockView,
} from "./planning-awaiting-stock.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRemindersService, type PlanningDueReminderItem } from "./planning-reminders.service";
import { PlanningRunService } from "./planning-run.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { MrpConfigService } from "./mrp-config.service";

export type {
  TodayAwaitingStockGroup,
  TodayAwaitingStockOrderLine,
  TodayAwaitingStockView,
} from "./planning-awaiting-stock.util";

export type TodaySuggestedAction = "pack" | "production" | "factory";

export type TodayBurningItem = {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  needQty: number;
  desiredDate: string;
  coverDays: number | null;
  reason: string;
  suggestedActions: TodaySuggestedAction[];
};

export type PlanningTodayView = {
  freshness: Awaited<ReturnType<PlanningCalculationService["getPlanningFreshness"]>>;
  mrpComputedAt: string | null;
  quota: { used: number; total: number };
  packSummary: { positionCount: number; totalQty: number };
  makeSummary: { positionCount: number; totalQty: number };
  burning: TodayBurningItem[];
  dueReminders: PlanningDueReminderItem[];
  awaitingStock: TodayAwaitingStockView;
};

@Injectable()
export class PlanningTodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculations: PlanningCalculationService,
    private readonly planningRuns: PlanningRunService,
    private readonly factory: FactoryOrderService,
    private readonly settings: PlanningSettingsService,
    private readonly mrpConfig: MrpConfigService,
    private readonly reminders: PlanningRemindersService,
  ) {}

  async getAwaitingStockGroups(): Promise<TodayAwaitingStockView> {
    const items = await this.prisma.orderItem.findMany({
      where: { order: { orderStage: OrderStage.AWAITING_STOCK } },
      select: {
        id: true,
        qty: true,
        qtyShipped: true,
        productId: true,
        productNameSnapshot: true,
        product: { select: { sku: true, name: true, stock: true } },
        order: { select: { id: true, orderNumber: true, warehouseId: true } },
      },
    });

    const productStockById = new Map<string, number>();
    for (const item of items) {
      if (item.productId && item.product) {
        productStockById.set(item.productId, item.product.stock);
      }
    }

    const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id)))];
    const warehouseIds = [
      ...new Set(items.map((i) => i.order.warehouseId).filter((id): id is string => Boolean(id))),
    ];
    const warehouseRows =
      warehouseIds.length > 0 && productIds.length > 0
        ? await this.prisma.productWarehouseStock.findMany({
            where: { warehouseId: { in: warehouseIds }, productId: { in: productIds } },
            select: { warehouseId: true, productId: true, qty: true },
          })
        : [];
    const warehouseStockByKey = new Map(
      warehouseRows.map((r) => [`${r.warehouseId}:${r.productId}`, r.qty]),
    );

    return groupAwaitingStockLines(
      items.map((item) => ({
        orderItemId: item.id,
        orderId: item.order.id,
        orderNumber: item.order.orderNumber,
        warehouseId: item.order.warehouseId,
        productId: item.productId,
        sku: item.product?.sku ?? null,
        name: item.product?.name ?? item.productNameSnapshot ?? "",
        qty: item.qty,
        qtyShipped: item.qtyShipped,
      })),
      productStockById,
      warehouseStockByKey,
    );
  }

  async getToday(): Promise<PlanningTodayView> {
    const [
      freshness,
      packaging,
      production,
      factoryRecs,
      latest,
      settings,
      horizon,
      dueReminders,
      awaitingStock,
    ] = await Promise.all([
        this.calculations.getPlanningFreshness(),
        this.planningRuns.getPackaging(),
        this.planningRuns.getProductionOrders(0),
        this.factory.getRecommendations(),
        this.planningRuns.getLatest(),
        this.settings.getSettings(),
        this.mrpConfig.getHorizon(),
        this.reminders.getDueReminders(),
        this.getAwaitingStockGroups(),
      ]);

    const packableQty = (packaging.canItems ?? []).reduce((s, i) => s + i.qty, 0);
    const packSummary = {
      positionCount: (packaging.canItems ?? []).length,
      totalQty: packableQty,
    };

    const productionQty = (production.items ?? []).reduce((s, i) => s + i.qty, 0);
    const factoryQty = factoryRecs.recommendations.reduce((s, r) => s + r.suggestedQty, 0);
    const makeSummary = {
      positionCount: (production.items ?? []).length + factoryRecs.recommendations.length,
      totalQty: productionQty + factoryQty,
    };

    const quota = {
      used: production.quotaUsedMonth0 ?? latest?.summary?.quotaUsedMonth0 ?? 0,
      total: production.monthlyPartsQuota ?? latest?.monthlyPartsQuota ?? 7000,
    };

    const canPackByProduct = new Map(
      (packaging.canItems ?? []).map((i) => [i.productId, i]),
    );
    const productionByProduct = new Map(
      (production.items ?? []).map((i) => [i.productId, i]),
    );
    const factoryByProduct = new Map(
      factoryRecs.recommendations.map((r) => [r.partProductId, r]),
    );

    const criticalLines =
      latest?.lines.filter((l) => l.lineType === PlanningRunLineType.CRITICAL) ?? [];

    const ctx = {
      packCycleDays: settings.packCycleDays,
      defaultPackLeadDays: horizon.defaultPackLeadDays,
    };

    const burning: TodayBurningItem[] = [];
    for (const line of criticalLines.slice(0, 20)) {
      const details = line.details ?? {};
      const hardDeficitQty = Number(details.hardDeficitQty ?? details.hardDeficit ?? 0);
      const hasHardDeficit = hardDeficitQty > 0;
      const productionLeadDays = Number(details.productionLeadDays ?? 14);
      const packLeadDays = Number(details.packLeadDays ?? ctx.defaultPackLeadDays);
      const desiredDate = computeDesiredDate({
        monthOffset: line.monthBucket ?? 0,
        hasHardDeficit,
        productionLeadDays,
        packLeadDays,
        packCycleDays: ctx.packCycleDays,
        lineType: line.lineType,
      });

      const suggestedActions: TodaySuggestedAction[] = [];
      if (canPackByProduct.has(line.productId)) suggestedActions.push("pack");
      if (productionByProduct.has(line.productId)) suggestedActions.push("production");
      if (factoryByProduct.has(line.productId)) suggestedActions.push("factory");
      if (line.kind === ProductKind.KIT && !suggestedActions.includes("pack")) {
        suggestedActions.push("pack");
      }
      if (
        (line.kind === ProductKind.KIT || line.kind === ProductKind.PART) &&
        !suggestedActions.includes("production")
      ) {
        suggestedActions.push("production");
      }
      if (line.kind === ProductKind.PART && factoryByProduct.has(line.productId)) {
        if (!suggestedActions.includes("factory")) suggestedActions.push("factory");
      }

      burning.push({
        lineId: line.id,
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        needQty: Math.max(0, Math.ceil(line.qty)),
        desiredDate,
        coverDays: line.coverDays,
        reason: line.reason ?? "",
        suggestedActions: [...new Set(suggestedActions)],
      });
    }

    return {
      freshness,
      mrpComputedAt:
        latest?.computedAt?.toISOString() ??
        (production.computedAt instanceof Date
          ? production.computedAt.toISOString()
          : production.computedAt ?? null),
      quota,
      packSummary,
      makeSummary,
      burning,
      dueReminders,
      awaitingStock,
    };
  }
}
