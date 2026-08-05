import { Injectable } from "@nestjs/common";
import { PlanningRunLineType, ProductionBatchStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MrpConfigService } from "./mrp-config.service";
import { computeDesiredDate } from "./mrp-desired-date.util";
import {
  ACTION_PRIORITY_ORDER,
  type ActionListItem,
  type ActionListPriority,
} from "./mrp-action-list.types";
import { PlanningSettingsService } from "./planning-settings.service";
import type { DecoratedPlanningRun } from "./planning-run.service";

type MrpLine = DecoratedPlanningRun["lines"][number];

@Injectable()
export class MrpActionListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlanningSettingsService,
    private readonly mrpConfig: MrpConfigService,
  ) {}

  async mapProductionLines(
    lines: MrpLine[],
    monthBucket?: number,
  ): Promise<ActionListItem[]> {
    const [settings, horizon] = await Promise.all([
      this.settings.getSettings(),
      this.mrpConfig.getHorizon(),
    ]);

    let filtered = lines.filter(
      (l) =>
        l.lineType === PlanningRunLineType.PRODUCTION ||
        l.lineType === PlanningRunLineType.SEMI_REORDER ||
        l.lineType === PlanningRunLineType.CRITICAL,
    );

    if (monthBucket != null && Number.isFinite(monthBucket)) {
      filtered = filtered.filter((l) => l.monthBucket === monthBucket);
    }

    const productionProductIds = new Set(
      filtered
        .filter(
          (l) =>
            l.lineType === PlanningRunLineType.PRODUCTION ||
            l.lineType === PlanningRunLineType.SEMI_REORDER,
        )
        .map((l) => l.productId),
    );
    filtered = filtered.filter(
      (l) =>
        l.lineType !== PlanningRunLineType.CRITICAL ||
        !productionProductIds.has(l.productId),
    );

    const items = await Promise.all(
      filtered.map((line) =>
        this.toActionItem(line, {
          packCycleDays: settings.packCycleDays,
          defaultPackLeadDays: horizon.defaultPackLeadDays,
        }),
      ),
    );

    return this.sortItems(items);
  }

  async mapPackagingLines(
    needPack: MrpLine[],
    canPack: MrpLine[],
  ): Promise<{
    needItems: ActionListItem[];
    canItems: ActionListItem[];
    blockedItems: ActionListItem[];
    items: ActionListItem[];
  }> {
    const [settings, horizon] = await Promise.all([
      this.settings.getSettings(),
      this.mrpConfig.getHorizon(),
    ]);
    const ctx = {
      packCycleDays: settings.packCycleDays,
      defaultPackLeadDays: horizon.defaultPackLeadDays,
    };

    const canByProduct = new Map(canPack.map((l) => [l.productId, l]));
    const needItems: ActionListItem[] = [];
    const blockedItems: ActionListItem[] = [];

    for (const line of needPack) {
      const item = await this.toActionItem(line, ctx);
      const maxFromParts = Number(line.details?.maxBuildNow ?? item.maxFromParts ?? 0);
      const packNeed = Number(line.details?.packNeed ?? line.details?.unmetPackNeed ?? line.qty);
      const enriched: ActionListItem = {
        ...item,
        packNeed,
        maxFromParts,
        bottleneckSku: (line.details?.bottleneckSku as string | null) ?? item.bottleneckSku,
        qty: packNeed,
      };
      needItems.push(enriched);

      if (
        line.kind === "KIT" &&
        packNeed > 0 &&
        maxFromParts <= 0 &&
        !canByProduct.has(line.productId)
      ) {
        blockedItems.push({
          ...enriched,
          qty: 0,
          blockers: ["no_components"],
          reason: enriched.bottleneckSku
            ? `Blocked: no stock for ${enriched.bottleneckSku}`
            : "Blocked: missing inventoried BOM parts",
        });
      }
    }

    const canItems = await Promise.all(
      canPack.map(async (line) => {
        const item = await this.toActionItem(line, ctx);
        const maxFromParts = Number(line.details?.maxBuildNow ?? 0);
        const packNeed = Number(line.details?.unmetPackNeed ?? line.details?.packNeed ?? line.qty);
        return {
          ...item,
          packNeed,
          maxFromParts,
          bottleneckSku: (line.details?.bottleneckSku as string | null) ?? null,
          qty: Math.min(packNeed, maxFromParts),
        };
      }),
    );

    const items = this.sortItems([...needItems, ...canItems, ...blockedItems]);
    return { needItems: this.sortItems(needItems), canItems: this.sortItems(canItems), blockedItems: this.sortItems(blockedItems), items };
  }

  sortItems(items: ActionListItem[]): ActionListItem[] {
    return [...items].sort((a, b) => {
      const pa = ACTION_PRIORITY_ORDER[a.priority];
      const pb = ACTION_PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      const dateCmp = a.desiredDate.localeCompare(b.desiredDate);
      if (dateCmp !== 0) return dateCmp;
      return b.qty - a.qty;
    });
  }

  private async toActionItem(
    line: MrpLine,
    ctx: { packCycleDays: number; defaultPackLeadDays: number },
  ): Promise<ActionListItem> {
    const details = line.details ?? {};
    const hardDeficitQty = Number(details.hardDeficitQty ?? details.hardDeficit ?? 0);
    const hasHardDeficit = hardDeficitQty > 0;
    const productionLeadDays = Number(details.productionLeadDays ?? 14);
    const packLeadDays = Number(details.packLeadDays ?? ctx.defaultPackLeadDays);
    const maxFromParts = Number(details.maxBuildNow ?? details.packReady ?? 0);
    const packNeed = Number(details.packNeed ?? details.unmetPackNeed ?? 0);

    const priority = this.resolvePriority(line, hasHardDeficit);
    const monthOffset = line.monthBucket ?? 0;

    const desiredDate = computeDesiredDate({
      monthOffset,
      hasHardDeficit,
      productionLeadDays,
      packLeadDays,
      packCycleDays: ctx.packCycleDays,
      lineType: line.lineType,
    });

    const blockers: string[] = [];
    if (line.lineType === PlanningRunLineType.CAN_PACK && maxFromParts <= 0) {
      blockers.push("no_components");
    }

    const canCreateBatch =
      line.lineType === PlanningRunLineType.PRODUCTION ||
      line.lineType === PlanningRunLineType.SEMI_REORDER ||
      line.lineType === PlanningRunLineType.PACK;

    if (canCreateBatch && !line.batchId) {
      const openBatch = await this.prisma.productionBatch.findFirst({
        where: {
          productId: line.productId,
          status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
        },
        select: { id: true },
      });
      if (openBatch) blockers.push("open_batch_exists");
    }
    if (line.batchId) blockers.push("batch_already_created");

    const qty =
      line.lineType === PlanningRunLineType.CAN_PACK
        ? Math.min(line.qty, maxFromParts > 0 ? maxFromParts : 0)
        : line.lineType === PlanningRunLineType.PACK
          ? packNeed > 0
            ? packNeed
            : line.qty
          : line.suggestedLaunchQty > 0
            ? line.suggestedLaunchQty
            : line.qty;

    return {
      lineId: line.id,
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      qty: Math.max(0, Math.ceil(qty)),
      desiredDate,
      reason: line.reason ?? "",
      priority,
      lineType: line.lineType,
      monthOffset,
      canCreateBatch: canCreateBatch && blockers.length === 0,
      blockers: blockers.length > 0 ? blockers : undefined,
      packNeed: packNeed > 0 ? packNeed : undefined,
      maxFromParts: maxFromParts > 0 ? maxFromParts : undefined,
      bottleneckSku: (details.bottleneckSku as string | null) ?? undefined,
    };
  }

  private resolvePriority(line: MrpLine, hasHardDeficit: boolean): ActionListPriority {
    if (line.lineType === PlanningRunLineType.CRITICAL) return "CRITICAL";
    if (hasHardDeficit) return "HARD";
    if (line.monthBucket === 0 || line.monthBucket == null) return "FORECAST";
    return "NORMAL";
  }
}
