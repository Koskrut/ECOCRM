import { Injectable } from "@nestjs/common";
import { OrderStage, PlanningRunLineType, ProductKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { displayBottleneckSku } from "./bom-part.util";
import { FactoryOrderService } from "./factory-order.service";
import { computeDesiredDate } from "./mrp-desired-date.util";
import {
  enrichAndSortAwaitingStockView,
  groupAwaitingStockLines,
  type AwaitingStockCapacityInfo,
  type TodayAwaitingStockView,
} from "./planning-awaiting-stock.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRemindersService, type PlanningDueReminderItem } from "./planning-reminders.service";
import { PlanningRunService } from "./planning-run.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { MrpConfigService } from "./mrp-config.service";
import {
  rankTodaySuggestedActions,
  type TodaySuggestedAction,
} from "./planning-today-suggested-actions.util";

export type {
  TodayAwaitingStockGroup,
  TodayAwaitingStockOrderLine,
  TodayAwaitingStockPrimaryAction,
  TodayAwaitingStockView,
} from "./planning-awaiting-stock.util";

export type { TodaySuggestedAction };

export type TodayBurningComponent = {
  sku: string;
  name: string;
  availableQty: number;
  /** Part gap: max(0, gross need − on-hand). */
  needQty: number | null;
};

export type TodayBurningItem = {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  needQty: number;
  maxFromParts: number;
  canAssemble: number;
  desiredDate: string;
  coverDays: number | null;
  reason: string;
  suggestedActions: TodaySuggestedAction[];
  bottleneckComponent: TodayBurningComponent | null;
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
        product: { select: { sku: true, name: true } },
        order: { select: { id: true, orderNumber: true, warehouseId: true } },
      },
    });

    const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id)))];
    const warehouseIds = [
      ...new Set(items.map((i) => i.order.warehouseId).filter((id): id is string => Boolean(id))),
    ];

    // Same 1C snapshot availability as MRP/pack — not Product.stock from the catalog.
    const productStockById = new Map<string, number>();
    await Promise.all(
      productIds.map(async (productId) => {
        const avail = await this.calculations.getAvailability(productId);
        productStockById.set(productId, avail.available);
      }),
    );

    const warehouseStockByKey = new Map<string, number>();
    if (warehouseIds.length > 0 && productIds.length > 0) {
      await Promise.all(
        warehouseIds.flatMap((warehouseId) =>
          productIds.map(async (productId) => {
            const avail = await this.calculations.getAvailability(productId, warehouseId);
            warehouseStockByKey.set(`${warehouseId}:${productId}`, avail.available);
          }),
        ),
      );
    }

    return enrichAndSortAwaitingStockView(
      groupAwaitingStockLines(
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
      ),
      await this.buildAwaitingStockCapacityMap(productIds),
    );
  }

  private async buildAwaitingStockCapacityMap(
    productIds: string[],
  ): Promise<Map<string, AwaitingStockCapacityInfo>> {
    const capacityByProductId = new Map<string, AwaitingStockCapacityInfo>();
    await Promise.all(
      productIds.map(async (productId) => {
        const capacity = await this.calculations.getKitCapacity(productId);
        capacityByProductId.set(productId, {
          maxFromParts: capacity.maxBuildNow,
          hasBom: capacity.components.length > 0,
        });
      }),
    );
    return capacityByProductId;
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
    const kitCapacityCache = new Map<
      string,
      Awaited<ReturnType<PlanningCalculationService["getKitCapacity"]>>
    >();

    for (const line of criticalLines.slice(0, 20)) {
      const details = line.details ?? {};
      const hardDeficitQty = Number(details.hardDeficitQty ?? details.hardDeficit ?? 0);
      const hasHardDeficit = hardDeficitQty > 0;
      const productionLeadDays = Number(details.productionLeadDays ?? 14);
      const packLeadDays = Number(details.packLeadDays ?? ctx.defaultPackLeadDays);
      const needQty = Math.max(0, Math.ceil(line.qty));
      const desiredDate = computeDesiredDate({
        monthOffset: line.monthBucket ?? 0,
        hasHardDeficit,
        productionLeadDays,
        packLeadDays,
        packCycleDays: ctx.packCycleDays,
        lineType: line.lineType,
      });

      const suggestedActions: TodaySuggestedAction[] = [];
      let maxFromParts = 0;
      let canAssemble = 0;
      let bottleneckComponent: TodayBurningComponent | null = null;

      if (line.kind === ProductKind.KIT) {
        let capacity = kitCapacityCache.get(line.productId);
        if (!capacity) {
          capacity = await this.calculations.getKitCapacity(line.productId);
          kitCapacityCache.set(line.productId, capacity);
        }
        maxFromParts = capacity.maxBuildNow;
        canAssemble = Math.min(needQty, maxFromParts);

        const bottleneck = capacity.components.find(
          (c) => c.componentProductId === capacity!.bottleneckComponentId,
        );
        if (bottleneck?.product) {
          const qtyPerKit = bottleneck.qtyPerKit > 0 ? bottleneck.qtyPerKit : 1;
          const availableQty = Math.max(0, Math.floor(bottleneck.available));
          const grossNeed = needQty > 0 ? Math.ceil(needQty * qtyPerKit) : 0;
          const partGap = Math.max(0, grossNeed - availableQty);
          bottleneckComponent = {
            sku: displayBottleneckSku(bottleneck.product.sku, bottleneck.product.name),
            name: bottleneck.product.name,
            availableQty,
            needQty: needQty > 0 ? partGap : null,
          };
        }

        suggestedActions.push(
          ...rankTodaySuggestedActions({
            kind: line.kind,
            kitNeed: needQty,
            maxFromParts,
            canAssemble,
            inCanPack: canPackByProduct.has(line.productId),
            hasFactoryRec: factoryByProduct.has(line.productId),
          }),
        );
      } else if (line.kind === ProductKind.PART) {
        const availability = await this.calculations.getAvailability(line.productId);
        const availableQty = availability.available;
        bottleneckComponent = {
          sku: line.sku,
          name: line.name,
          availableQty,
          needQty: needQty > 0 ? Math.max(0, needQty - availableQty) : null,
        };
        suggestedActions.push(
          ...rankTodaySuggestedActions({
            kind: line.kind,
            kitNeed: needQty,
            maxFromParts: 0,
            canAssemble: 0,
            inCanPack: canPackByProduct.has(line.productId),
            hasFactoryRec: factoryByProduct.has(line.productId),
          }),
        );
      } else {
        suggestedActions.push(
          ...rankTodaySuggestedActions({
            kind: line.kind as ProductKind,
            kitNeed: needQty,
            maxFromParts: 0,
            canAssemble: 0,
            inCanPack: canPackByProduct.has(line.productId),
            hasFactoryRec: factoryByProduct.has(line.productId),
          }),
        );
      }

      burning.push({
        lineId: line.id,
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        needQty,
        maxFromParts,
        canAssemble,
        desiredDate,
        coverDays: line.coverDays,
        reason: line.reason ?? "",
        suggestedActions: [...new Set(suggestedActions)],
        bottleneckComponent,
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
