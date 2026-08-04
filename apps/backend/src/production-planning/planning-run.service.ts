import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PlanningRunLineType, PlanningRunMode, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { MrpCalculationService } from "./mrp-calculation.service";
import { ProductionService } from "./production.service";

@Injectable()
export class PlanningRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mrp: MrpCalculationService,
    private readonly production: ProductionService,
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

  async getLatest(mode?: PlanningRunMode) {
    const run = await this.prisma.planningRun.findFirst({
      where: mode ? { mode } : undefined,
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

  async getCritical() {
    const latest = await this.getLatest();
    if (!latest) return { runId: null, computedAt: null, lines: [] };
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
      lines,
    };
  }

  async getProductionOrders(monthBucket?: number) {
    const latest = await this.getLatest(PlanningRunMode.FULL);
    if (!latest) return { runId: null, computedAt: null, monthlyPartsQuota: null, lines: [] };
    let lines = latest.lines.filter((l) => l.lineType === PlanningRunLineType.PRODUCTION);
    if (monthBucket != null && Number.isFinite(monthBucket)) {
      lines = lines.filter((l) => l.monthBucket === monthBucket);
    }
    const quotaUsed = lines
      .filter((l) => l.monthBucket === 0 || monthBucket === 0)
      .reduce((sum, l) => {
        const parts = typeof l.details?.partsQty === "number" ? l.details.partsQty : l.suggestedLaunchQty;
        return sum + parts;
      }, 0);
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      monthlyPartsQuota: latest.monthlyPartsQuota,
      quotaUsedMonth0: monthBucket == null || monthBucket === 0 ? quotaUsed : undefined,
      lines,
    };
  }

  async getPackaging() {
    const latest = await this.getLatest();
    if (!latest) {
      return { runId: null, computedAt: null, needPack: [], canPack: [] };
    }
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      needPack: latest.lines.filter((l) => l.lineType === PlanningRunLineType.PACK),
      canPack: latest.lines.filter((l) => l.lineType === PlanningRunLineType.CAN_PACK),
    };
  }

  async getSemiFinished() {
    const latest = await this.getLatest();
    if (!latest) return { runId: null, computedAt: null, lines: [] };
    return {
      runId: latest.id,
      computedAt: latest.computedAt,
      lines: latest.lines.filter((l) => l.lineType === PlanningRunLineType.SEMI_REORDER),
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

  private decorateRun(
    run: {
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
    },
  ) {
    const details =
      run.details && typeof run.details === "object" ? (run.details as Record<string, unknown>) : {};
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
        details: (l.details && typeof l.details === "object" ? l.details : {}) as Record<string, unknown>,
        batchId: l.batchId,
      })),
    };
  }
}
