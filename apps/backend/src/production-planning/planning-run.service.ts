import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  PlanningRunLineType,
  PlanningRunMode,
  Prisma,
  ProductionBatchStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MrpCalculationService } from "./mrp-calculation.service";
import { MrpConfigService } from "./mrp-config.service";
import { MrpActionListService } from "./mrp-action-list.service";
import { ProductionService } from "./production.service";

export type DecoratedPlanningRun = {
  id: string;
  mode: PlanningRunMode;
  computedAt: Date;
  coverMonths: number;
  monthlyPartsQuota: number;
  velocityLookbackMonths: number;
  snapshotId: string | null;
  summary: Record<string, number>;
  freshness: unknown;
  salesFreshness?: unknown;
  stale: boolean;
  liveCapacity: { monthlyPartsQuota: number };
  liveHorizon: { coverMonths: number; velocityLookbackMonths: number };
  runCapacity: { monthlyPartsQuota: number; coverMonths: number; velocityLookbackMonths: number };
  lines: Array<{
    id: string;
    productId: string;
    sku: string;
    name: string;
    kind: string;
    lineType: PlanningRunLineType;
    qty: number;
    suggestedLaunchQty: number;
    priority: number;
    monthBucket: number | null;
    coverDays: number | null;
    reason: string | null;
    details: Record<string, unknown>;
    batchId: string | null;
  }>;
};

@Injectable()
export class PlanningRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mrp: MrpCalculationService,
    private readonly mrpConfig: MrpConfigService,
    private readonly production: ProductionService,
    private readonly actionList: MrpActionListService,
  ) {}

  async runAndPersist(mode: PlanningRunMode = PlanningRunMode.FULL) {
    const result = await this.mrp.calculate(mode);
    const run = await this.prisma.planningRun.create({
      data: {
        mode: result.mode,
        coverMonths: result.coverMonths,
        monthlyPartsQuota: result.monthlyPartsQuota,
        velocityLookbackMonths: result.velocityLookbackMonths,
        snapshotId: result.snapshotId,
        details: {
          summary: result.summary,
          freshness: result.freshness,
          salesFreshness: result.salesFreshness,
          salesUploadId: result.salesUploadId,
        } as Prisma.InputJsonValue,
        lines: {
          create: result.lines.map((line) => ({
            productId: line.productId,
            lineType: line.lineType,
            qty: line.qty,
            suggestedLaunchQty: line.suggestedLaunchQty,
            priority: line.priority,
            monthBucket: line.monthBucket,
            coverDays: line.coverDays,
            reason: line.reason,
            details: {
              ...line.details,
              sku: line.sku,
              name: line.name,
              kind: line.kind,
            } as Prisma.InputJsonValue,
          })),
        },
      },
      include: {
        lines: {
          include: { product: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qty: "desc" }],
        },
      },
    });
    return this.decorateRun(run);
  }

  /**
   * Latest run. Defaults to FULL so dashboard/packaging/semi are not starved by a
   * daily CRITICAL-only persist.
   */
  async getLatest(mode: PlanningRunMode = PlanningRunMode.FULL) {
    const run = await this.prisma.planningRun.findFirst({
      where: { mode },
      orderBy: { computedAt: "desc" },
      include: {
        lines: {
          include: { product: { select: { id: true, sku: true, name: true, kind: true } } },
          orderBy: [{ priority: "asc" }, { qty: "desc" }],
        },
      },
    });
    if (!run) return null;
    return this.decorateRun(run);
  }

  /** CRITICAL + SEMI from latest FULL run (SEMI included for part-launch visibility). */
  async getCritical() {
    const latest = await this.getLatest(PlanningRunMode.FULL);
    if (!latest) return { runId: null, computedAt: null, lines: [], stale: false };
    const lines = latest.lines.filter(
      (l) =>
        l.lineType === PlanningRunLineType.CRITICAL ||
        l.lineType === PlanningRunLineType.SEMI_REORDER,
    );
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      freshness: latest.freshness,
      summary: latest.summary,
      stale: latest.stale,
      liveCapacity: latest.liveCapacity,
      runCapacity: latest.runCapacity,
      lines,
    };
  }

  async getProductionOrders(monthBucket?: number) {
    const latest = await this.getLatest(PlanningRunMode.FULL);
    if (!latest) {
      return {
        runId: null,
        computedAt: null,
        monthlyPartsQuota: null,
        lines: [],
        items: [],
        stale: false,
      };
    }
    let lines = latest.lines.filter(
      (l) =>
        l.lineType === PlanningRunLineType.PRODUCTION ||
        l.lineType === PlanningRunLineType.SEMI_REORDER ||
        l.lineType === PlanningRunLineType.CRITICAL,
    );
    if (monthBucket != null && Number.isFinite(monthBucket)) {
      lines = lines.filter((l) => l.monthBucket === monthBucket);
    }

    const quotaUsedMonth0 = PlanningRunService.sumQuotaUsedMonth0(latest.lines);
    const items = await this.actionList.mapProductionLines(lines);

    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      monthlyPartsQuota: latest.monthlyPartsQuota,
      quotaUsedMonth0,
      stale: latest.stale,
      liveCapacity: latest.liveCapacity,
      runCapacity: latest.runCapacity,
      lines,
      items,
    };
  }

  async getPackaging() {
    const latest = await this.getLatest(PlanningRunMode.FULL);
    if (!latest) {
      return {
        runId: null,
        computedAt: null,
        needPack: [],
        canPack: [],
        needItems: [],
        canItems: [],
        blockedItems: [],
        items: [],
        stale: false,
      };
    }
    const needPack = latest.lines.filter((l) => l.lineType === PlanningRunLineType.PACK);
    const canPack = latest.lines.filter((l) => l.lineType === PlanningRunLineType.CAN_PACK);
    const { needItems, canItems, blockedItems, items } =
      await this.actionList.mapPackagingLines(needPack, canPack);
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      stale: latest.stale,
      needPack,
      canPack,
      needItems,
      canItems,
      blockedItems,
      items,
    };
  }

  async getSemiFinished() {
    const latest = await this.getLatest(PlanningRunMode.FULL);
    if (!latest) return { runId: null, computedAt: null, lines: [], stale: false };
    // SEMI_REORDER lines, plus PART PRODUCTION (non-risk parts still need visibility).
    const lines = latest.lines.filter(
      (l) =>
        l.lineType === PlanningRunLineType.SEMI_REORDER ||
        (l.lineType === PlanningRunLineType.PRODUCTION && l.kind === "PART"),
    );
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      stale: latest.stale,
      lines,
    };
  }

  async createBatchFromLine(lineId: string, input?: { code?: string; qtyPlanned?: number; dueAt?: string }) {
    const line = await this.prisma.planningRunLine.findUnique({
      where: { id: lineId },
      include: { product: { select: { id: true, sku: true } } },
    });
    if (!line) throw new NotFoundException("Planning run line not found");
    if (
      line.lineType !== PlanningRunLineType.PRODUCTION &&
      line.lineType !== PlanningRunLineType.SEMI_REORDER &&
      line.lineType !== PlanningRunLineType.PACK
    ) {
      throw new BadRequestException("Only PRODUCTION, SEMI_REORDER, or PACK lines can create batches");
    }
    if (line.batchId) {
      throw new BadRequestException("Batch already created for this line");
    }

    const openBatch = await this.prisma.productionBatch.findFirst({
      where: {
        productId: line.productId,
        status: { in: [ProductionBatchStatus.DRAFT, ProductionBatchStatus.IN_PROGRESS] },
      },
      select: { id: true, code: true },
    });
    if (openBatch) {
      throw new BadRequestException(
        `Open batch already exists for this product (${openBatch.code})`,
      );
    }

    const siblingBatched = await this.prisma.planningRunLine.findFirst({
      where: {
        runId: line.runId,
        productId: line.productId,
        batchId: { not: null },
        id: { not: lineId },
      },
      select: { id: true },
    });
    if (siblingBatched) {
      throw new BadRequestException("Another MRP line for this product already created a batch");
    }

    const qty = input?.qtyPlanned ?? line.suggestedLaunchQty ?? line.qty;
    if (qty <= 0) throw new BadRequestException("qtyPlanned must be > 0");

    const code =
      input?.code?.trim() ||
      `MRP-${line.product.sku}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${line.id.slice(-4)}`;

    const batch = await this.production.createBatch({
      code,
      productId: line.productId,
      qtyPlanned: qty,
      dueAt: input?.dueAt,
    });

    await this.prisma.planningRunLine.update({
      where: { id: lineId },
      data: { batchId: batch.id },
    });

    return { lineId, batch };
  }

  /** Sum month0Qty from PRODUCTION+SEMI lines with monthBucket===0 (test helper / shared). */
  static sumQuotaUsedMonth0(
    lines: Array<{
      lineType: PlanningRunLineType;
      monthBucket: number | null;
      details: Record<string, unknown>;
    }>,
  ): number {
    return lines
      .filter(
        (l) =>
          (l.lineType === PlanningRunLineType.PRODUCTION ||
            l.lineType === PlanningRunLineType.SEMI_REORDER) &&
          l.monthBucket === 0,
      )
      .reduce((sum, l) => {
        const m0 = l.details?.month0Qty;
        return sum + (typeof m0 === "number" && Number.isFinite(m0) ? m0 : 0);
      }, 0);
  }

  private async decorateRun(run: {
    id: string;
    mode: PlanningRunMode;
    computedAt: Date;
    coverMonths: number;
    monthlyPartsQuota: number;
    velocityLookbackMonths: number;
    snapshotId: string | null;
    details: unknown;
    lines: Array<{
      id: string;
      productId: string;
      lineType: PlanningRunLineType;
      qty: number;
      suggestedLaunchQty: number;
      priority: number;
      monthBucket: number | null;
      coverDays: number | null;
      reason: string | null;
      details: unknown;
      batchId: string | null;
      product: { id: string; sku: string; name: string; kind: string };
    }>;
  }): Promise<DecoratedPlanningRun> {
    const [liveCapacity, liveHorizon] = await Promise.all([
      this.mrpConfig.getCapacity(),
      this.mrpConfig.getHorizon(),
    ]);
    const details =
      run.details && typeof run.details === "object" ? (run.details as Record<string, unknown>) : {};
    const runCapacity = {
      monthlyPartsQuota: run.monthlyPartsQuota,
      coverMonths: run.coverMonths,
      velocityLookbackMonths: run.velocityLookbackMonths,
    };
    const stale =
      run.monthlyPartsQuota !== liveCapacity.monthlyPartsQuota ||
      run.coverMonths !== liveHorizon.coverMonths ||
      run.velocityLookbackMonths !== liveHorizon.velocityLookbackMonths;

    return {
      id: run.id,
      mode: run.mode,
      computedAt: run.computedAt,
      coverMonths: run.coverMonths,
      monthlyPartsQuota: run.monthlyPartsQuota,
      velocityLookbackMonths: run.velocityLookbackMonths,
      snapshotId: run.snapshotId,
      summary: (details.summary as Record<string, number>) ?? {},
      freshness: details.freshness ?? null,
      salesFreshness: details.salesFreshness ?? null,
      stale,
      liveCapacity: { monthlyPartsQuota: liveCapacity.monthlyPartsQuota },
      liveHorizon: {
        coverMonths: liveHorizon.coverMonths,
        velocityLookbackMonths: liveHorizon.velocityLookbackMonths,
      },
      runCapacity,
      lines: run.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        sku: l.product.sku,
        name: l.product.name,
        kind: l.product.kind,
        lineType: l.lineType,
        qty: l.qty,
        suggestedLaunchQty: l.suggestedLaunchQty,
        priority: l.priority,
        monthBucket: l.monthBucket,
        coverDays: l.coverDays,
        reason: l.reason,
        details: (l.details && typeof l.details === "object" ? l.details : {}) as Record<
          string,
          unknown
        >,
        batchId: l.batchId,
      })),
    };
  }
}
