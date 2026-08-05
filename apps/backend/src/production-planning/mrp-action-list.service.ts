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
  ): Promise<ActionListItem[]> {
    const [settings, horizon] = await Promise.all([
      this.settings.getSettings(),
      this.mrpConfig.getHorizon(),
    ]);
    const ctx = {
      packCycleDays: settings.packCycleDays,
      defaultPackLeadDays: horizon.defaultPackLeadDays,
    };
    const items = await Promise.all(
      [...needPack, ...canPack].map((line) => this.toActionItem(line, ctx)),
    );
    return this.sortItems(items);
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
    const maxBuildNow = Number(details.maxBuildNow ?? details.packReady ?? 0);

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
    if (line.lineType === PlanningRunLineType.CAN_PACK && maxBuildNow <= 0) {
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
        ? Math.min(line.qty, maxBuildNow > 0 ? maxBuildNow : line.qty)
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
    };
  }

  private resolvePriority(line: MrpLine, hasHardDeficit: boolean): ActionListPriority {
    if (line.lineType === PlanningRunLineType.CRITICAL) return "CRITICAL";
    if (hasHardDeficit) return "HARD";
    if (line.monthBucket === 0 || line.monthBucket == null) return "FORECAST";
    return "NORMAL";
  }
}
