import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { OrderStage, ProductionStageCode, UserRole } from "@prisma/client";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { BomImportService } from "./bom-import.service";
import { BomService } from "./bom.service";
import { DemandRulesService } from "./demand-rules.service";
import { InventorySnapshotService } from "./inventory-snapshot.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { ProductionService } from "./production.service";
import { WeeklyPlanningJob } from "./weekly-planning.job";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";

@Controller("planning")
@RequireModule(ModuleIds.ProductionPlanning)
export class ProductionPlanningController {
  constructor(
    private readonly demandRules: DemandRulesService,
    private readonly bomImport: BomImportService,
    private readonly bomService: BomService,
    private readonly snapshots: InventorySnapshotService,
    private readonly calculations: PlanningCalculationService,
    private readonly production: ProductionService,
    private readonly weeklyJob: WeeklyPlanningJob,
  ) {}

  @Get("config/demand-rules")
  getDemandRules() {
    return this.demandRules.getRules();
  }

  @Patch("config/demand-rules")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  setDemandRules(
    @Body()
    body: {
      hardStages: string[];
      softStages: string[];
      includeOrderItemsWithoutProductIdAsSoft?: boolean;
    },
  ) {
    if (!Array.isArray(body.hardStages) || !Array.isArray(body.softStages)) {
      throw new BadRequestException("hardStages and softStages arrays are required");
    }
    const validOrderStages = new Set(Object.values(OrderStage));
    const hardStages = body.hardStages.filter((x): x is OrderStage => validOrderStages.has(x as OrderStage));
    const softStages = body.softStages.filter((x): x is OrderStage => validOrderStages.has(x as OrderStage));
    if (hardStages.length === 0 && softStages.length === 0) {
      throw new BadRequestException("At least one stage must be configured");
    }
    return this.demandRules.setRules({
      hardStages,
      softStages,
      includeOrderItemsWithoutProductIdAsSoft: body.includeOrderItemsWithoutProductIdAsSoft ?? true,
    });
  }

  @Post("boms/import")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  importBomFile(@UploadedFile() file: { buffer?: Buffer } | undefined) {
    if (!file?.buffer) throw new BadRequestException("File is required");
    return this.bomImport.importFile(file.buffer);
  }

  @Get("boms/:kitProductId")
  getActiveBom(@Param("kitProductId") kitProductId: string) {
    return this.bomService.getActiveBom(kitProductId);
  }

  @Post("boms/:kitProductId/revision")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  createBomRevision(
    @Param("kitProductId") kitProductId: string,
    @Body() body: { lines: Array<{ componentProductId: string; qtyPerKit: number; scrapPct?: number; sortOrder?: number }> },
  ) {
    return this.bomService.upsertNewRevision(kitProductId, body.lines ?? []);
  }

  @Get("inventory-snapshots")
  listSnapshots(@Query("limit") limit?: string) {
    return this.snapshots.list(limit ? Number(limit) : 20);
  }

  @Get("inventory-snapshots/latest-posted")
  latestPosted() {
    return this.snapshots.latestPosted();
  }

  @Post("inventory-snapshots/upload")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  uploadSnapshot(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() body: { note?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    if (!file?.buffer) throw new BadRequestException("File is required");
    return this.snapshots.createStagedFromFile({
      fileBuffer: file.buffer,
      importedById: userId,
      note: body.note,
    });
  }

  @Post("inventory-snapshots/:id/post")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  postSnapshot(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    return this.snapshots.postSnapshot(id, userId);
  }

  @Get("availability/:productId")
  getAvailability(@Param("productId") productId: string, @Query("warehouseId") warehouseId?: string) {
    return this.calculations.getAvailability(productId, warehouseId);
  }

  @Get("kits/:kitProductId/capacity")
  getKitCapacity(@Param("kitProductId") kitProductId: string) {
    return this.calculations.getKitCapacity(kitProductId);
  }

  @Get("recommendations/launch")
  getLaunchRecommendations(@Query("horizonWeeks") horizonWeeks?: string) {
    const parsed = horizonWeeks ? Math.max(1, Number.parseInt(horizonWeeks, 10) || 1) : 1;
    return this.calculations.getLaunchRecommendations(parsed);
  }

  @Get("production/batches")
  listBatches() {
    return this.production.listBatches();
  }

  @Post("production/batches")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  createBatch(
    @Body() body: { code: string; productId: string; qtyPlanned: number; dueAt?: string; orderId?: string },
  ) {
    return this.production.createBatch(body);
  }

  @Post("production/batches/:batchId/move-stage")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  moveStage(
    @Param("batchId") batchId: string,
    @Body()
    body: {
      toStageCode: ProductionStageCode;
      qtyInStage?: number;
      qtyGoodIncrement?: number;
      qtyScrapIncrement?: number;
      note?: string;
    },
  ) {
    return this.production.moveBatchStage({ batchId, ...body });
  }

  @Get("queues/qc")
  getQcQueue() {
    return this.production.getQcQueue();
  }

  @Get("queues/packing")
  getPackingQueue() {
    return this.production.getPackingQueue();
  }

  @Post("jobs/weekly-plan/run")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  runWeeklyPlan() {
    return this.weeklyJob.runNow();
  }
}

