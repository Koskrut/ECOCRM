import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ProductionBatchStatus, ProductionStageCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ProductionService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefaultStages() {
    const defaults: Array<{ code: ProductionStageCode; name: string; sortOrder: number }> = [
      { code: ProductionStageCode.MECH, name: "Мехобработка", sortOrder: 10 },
      { code: ProductionStageCode.DEGREASE, name: "Дегризер", sortOrder: 20 },
      { code: ProductionStageCode.QC, name: "ОТК", sortOrder: 30 },
      { code: ProductionStageCode.PACK, name: "Упаковка", sortOrder: 40 },
    ];
    for (const stage of defaults) {
      await this.prisma.productionStage.upsert({
        where: { code: stage.code },
        update: { name: stage.name, sortOrder: stage.sortOrder, isActive: true },
        create: stage,
      });
    }
  }

  async listBatches() {
    return this.prisma.productionBatch.findMany({
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        product: { select: { id: true, sku: true, name: true } },
        currentStage: { select: { id: true, code: true, name: true } },
        movements: {
          orderBy: { enteredAt: "desc" },
          take: 1,
          include: { stage: { select: { code: true, name: true } } },
        },
      },
    });
  }

  async createBatch(input: {
    code: string;
    productId: string;
    qtyPlanned: number;
    dueAt?: string;
    orderId?: string;
  }) {
    if (!input.code.trim()) throw new BadRequestException("Batch code is required");
    if (input.qtyPlanned <= 0) throw new BadRequestException("qtyPlanned must be > 0");
    await this.ensureDefaultStages();
    const firstStage = await this.prisma.productionStage.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!firstStage) throw new BadRequestException("No production stages configured");

    return this.prisma.productionBatch.create({
      data: {
        code: input.code.trim(),
        productId: input.productId,
        qtyPlanned: Math.floor(input.qtyPlanned),
        orderId: input.orderId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        status: ProductionBatchStatus.IN_PROGRESS,
        startedAt: new Date(),
        currentStageId: firstStage.id,
        movements: {
          create: {
            stageId: firstStage.id,
            qtyInStage: Math.floor(input.qtyPlanned),
            enteredAt: new Date(),
            isCurrent: true,
          },
        },
      },
    });
  }

  async moveBatchStage(input: {
    batchId: string;
    toStageCode: ProductionStageCode;
    qtyInStage?: number;
    qtyGoodIncrement?: number;
    qtyScrapIncrement?: number;
    note?: string;
  }) {
    const batch = await this.prisma.productionBatch.findUnique({
      where: { id: input.batchId },
      include: { currentStage: true },
    });
    if (!batch) throw new NotFoundException("Batch not found");
    const toStage = await this.prisma.productionStage.findUnique({ where: { code: input.toStageCode } });
    if (!toStage) throw new NotFoundException("Target stage not found");

    const qtyGoodInc = Math.max(0, Math.floor(input.qtyGoodIncrement ?? 0));
    const qtyScrapInc = Math.max(0, Math.floor(input.qtyScrapIncrement ?? 0));
    const qtyInStage = Math.max(0, Math.floor(input.qtyInStage ?? batch.qtyPlanned));
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      if (batch.currentStageId) {
        await tx.wipMovement.updateMany({
          where: { batchId: batch.id, isCurrent: true },
          data: { isCurrent: false, exitedAt: now },
        });
      }

      await tx.wipMovement.create({
        data: {
          batchId: batch.id,
          stageId: toStage.id,
          qtyInStage,
          isCurrent: true,
          enteredAt: now,
          note: input.note ?? null,
        },
      });

      const nextStatus =
        input.toStageCode === ProductionStageCode.PACK && qtyGoodInc + batch.qtyGood >= batch.qtyPlanned
          ? ProductionBatchStatus.DONE
          : ProductionBatchStatus.IN_PROGRESS;

      return tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          currentStageId: toStage.id,
          qtyGood: { increment: qtyGoodInc },
          qtyScrap: { increment: qtyScrapInc },
          status: nextStatus,
          completedAt: nextStatus === ProductionBatchStatus.DONE ? now : null,
        },
        include: {
          product: { select: { sku: true, name: true } },
          currentStage: { select: { code: true, name: true } },
        },
      });
    });
  }

  async getQcQueue() {
    const stage = await this.prisma.productionStage.findUnique({
      where: { code: ProductionStageCode.QC },
      select: { id: true },
    });
    if (!stage) return [];
    return this.prisma.productionBatch.findMany({
      where: { currentStageId: stage.id, status: { in: [ProductionBatchStatus.IN_PROGRESS] } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "asc" }],
      include: { product: { select: { sku: true, name: true } } },
    });
  }

  async getPackingQueue() {
    const stage = await this.prisma.productionStage.findUnique({
      where: { code: ProductionStageCode.PACK },
      select: { id: true },
    });
    if (!stage) return [];
    return this.prisma.productionBatch.findMany({
      where: { currentStageId: stage.id, status: { in: [ProductionBatchStatus.IN_PROGRESS] } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "asc" }],
      include: { product: { select: { sku: true, name: true } } },
    });
  }
}

