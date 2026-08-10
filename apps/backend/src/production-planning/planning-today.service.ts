import { Injectable } from "@nestjs/common";
import { PlanningRunLineType, ProductKind } from "@prisma/client";
import { FactoryOrderService } from "./factory-order.service";
import { computeDesiredDate } from "./mrp-desired-date.util";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRemindersService, type PlanningDueReminderItem } from "./planning-reminders.service";
import { PlanningRunService } from "./planning-run.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { MrpConfigService } from "./mrp-config.service";

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
};

@Injectable()
export class PlanningTodayService {
  constructor(
    private readonly calculations: PlanningCalculationService,
    private readonly planningRuns: PlanningRunService,
    private readonly factory: FactoryOrderService,
    private readonly settings: PlanningSettingsService,
    private readonly mrpConfig: MrpConfigService,
    private readonly reminders: PlanningRemindersService,
  ) {}

  async getToday(): Promise<PlanningTodayView> {
    const [freshness, packaging, production, factoryRecs, latest, settings, horizon, dueReminders] =
      await Promise.all([
        this.calculations.getPlanningFreshness(),
        this.planningRuns.getPackaging(),
        this.planningRuns.getProductionOrders(0),
        this.factory.getRecommendations(),
        this.planningRuns.getLatest(),
        this.settings.getSettings(),
        this.mrpConfig.getHorizon(),
        this.reminders.getDueReminders(),
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
    };
  }
}
