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
import {
  FactoryOrderStatus,
  OrderStage,
  PlanningDemandMix,
  PlanningRunMode,
  ProductionStageCode,
  UserRole,
} from "@prisma/client";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { Roles } from "../auth/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { BomImportService } from "./bom-import.service";
import { BomService } from "./bom.service";
import { DemandRulesService } from "./demand-rules.service";
import { DemandForecastService } from "./demand-forecast.service";
import { FactoryOrderService } from "./factory-order.service";
import { ForecastService } from "./forecast.service";
import { InventorySnapshotService } from "./inventory-snapshot.service";
import { MrpConfigService } from "./mrp-config.service";
import { PackingListService } from "./packing-list.service";
import { PlanningCalculationService } from "./planning-calculation.service";
import { PlanningRunService } from "./planning-run.service";
import { PlanningSettingsService } from "./planning-settings.service";
import { ProductionService } from "./production.service";
import { SalesHistoryService } from "./sales-history.service";
import { PlanningTodayService } from "./planning-today.service";
import { WeeklyPlanningJob } from "./weekly-planning.job";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";

@Controller("planning")
@RequireModule(ModuleIds.ProductionPlanning)
export class ProductionPlanningController {
  constructor(
    private readonly demandRules: DemandRulesService,
    private readonly demandForecast: DemandForecastService,
    private readonly planningSettings: PlanningSettingsService,
    private readonly mrpConfig: MrpConfigService,
    private readonly bomImport: BomImportService,
    private readonly bomService: BomService,
    private readonly snapshots: InventorySnapshotService,
    private readonly calculations: PlanningCalculationService,
    private readonly forecast: ForecastService,
    private readonly salesHistory: SalesHistoryService,
    private readonly packingLists: PackingListService,
    private readonly factoryOrders: FactoryOrderService,
    private readonly production: ProductionService,
    private readonly planningRuns: PlanningRunService,
    private readonly today: PlanningTodayService,
    private readonly weeklyJob: WeeklyPlanningJob,
  ) {}

  @Get("today")
  getToday() {
    return this.today.getToday();
  }

  @Get("config/demand-rules")
  getDemandRules() {
    return this.demandRules.getRules();
  }

  @Patch("config/demand-rules")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async setDemandRules(
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
    const rules = await this.demandRules.setRules({
      hardStages,
      softStages,
      includeOrderItemsWithoutProductIdAsSoft: body.includeOrderItemsWithoutProductIdAsSoft ?? true,
    });
    const resync = await this.demandRules.resyncReservationHardness();
    return { ...rules, resync };
  }

  @Post("config/demand-rules/resync-reservations")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  resyncDemandRuleReservations() {
    return this.demandRules.resyncReservationHardness();
  }

  @Get("config/settings")
  getPlanningSettings() {
    return this.planningSettings.getSettings();
  }

  @Patch("config/settings")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async setPlanningSettings(
    @Body()
    body: {
      packCycleDays?: number;
      packCapacityPerCycle?: number;
      factoryLeadTimeDays?: number;
      safetyStockWeeks?: number;
      snapshotMaxAgeDays?: number;
      demandMix?: string;
    },
  ) {
    const demandMixValues = new Set(Object.values(PlanningDemandMix));
    if (body.demandMix != null && !demandMixValues.has(body.demandMix as PlanningDemandMix)) {
      throw new BadRequestException("Invalid demandMix");
    }
    const settings = await this.planningSettings.setSettings({
      ...body,
      demandMix: body.demandMix as PlanningDemandMix | undefined,
    });
    // demandMix / lead / safety affect MRP — refresh FULL run so UI matches live config.
    const mrpRun = await this.planningRuns.runAndPersist(PlanningRunMode.FULL);
    return { ...settings, mrpRunId: mrpRun.id, mrpSummary: mrpRun.summary };
  }

  @Get("freshness")
  getFreshness() {
    return this.calculations.getPlanningFreshness();
  }

  @Get("dashboard")
  getDashboard() {
    return this.calculations.getDashboardSummary();
  }

  @Get("projection")
  getProjection(@Query("weeks") weeks?: string) {
    const parsed = weeks
      ? weeks
          .split(",")
          .map((x) => Number.parseInt(x.trim(), 10))
          .filter((n) => Number.isFinite(n) && n > 0)
      : [2, 4, 8, 12];
    return this.calculations.getStockProjection(parsed.length ? parsed : [2, 4, 8, 12]);
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

  @Get("forecast")
  listForecast(@Query("horizonDays") horizonDays?: string) {
    const n = horizonDays ? Number.parseInt(horizonDays, 10) : undefined;
    return this.forecast.listForecasts(Number.isFinite(n) ? n : undefined);
  }

  @Post("forecast/recompute")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  recomputeForecast() {
    return this.forecast.recomputeForecasts();
  }

  @Post("forecast/sales-history/import")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async importSalesHistory(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!file?.buffer) throw new BadRequestException("File is required");
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    const uploaded = await this.salesHistory.upload({
      buffer: file.buffer,
      importedById: userId,
    });
    const posted = await this.salesHistory.post(uploaded.upload.id, userId);
    return {
      format: uploaded.format,
      uploadId: posted?.id ?? uploaded.upload.id,
      importedRows: uploaded.importedRows,
      resolvedRows: uploaded.resolvedRows,
      unresolvedSku: uploaded.unresolvedSku,
      status: posted?.status ?? uploaded.upload.status,
    };
  }

  @Post("sales-history/upload")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  uploadSalesHistory(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Req() req: Request & { user?: AuthUser },
    @Body() body?: { note?: string },
  ) {
    if (!file?.buffer) throw new BadRequestException("File is required");
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    return this.salesHistory.upload({
      buffer: file.buffer,
      importedById: userId,
      note: body?.note,
    });
  }

  @Get("sales-history")
  listSalesHistory(@Query("limit") limit?: string) {
    return this.salesHistory.list(limit ? Number(limit) : 20);
  }

  @Get("sales-history/latest-posted")
  latestPostedSalesHistory() {
    return this.salesHistory.latestPosted();
  }

  @Get("sales-history/:id")
  getSalesHistory(@Param("id") id: string) {
    return this.salesHistory.get(id);
  }

  @Post("sales-history/:id/post")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  postSalesHistory(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    return this.salesHistory.post(id, userId);
  }

  @Get("packing-lists")
  listPackingLists(@Query("limit") limit?: string) {
    return this.packingLists.list(limit ? Number(limit) : 20);
  }

  @Get("packing-lists/:id")
  getPackingList(@Param("id") id: string) {
    return this.packingLists.get(id);
  }

  @Post("packing-lists/propose")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  proposePackingList(@Body() body: { cycleStart?: string }) {
    return this.packingLists.propose(body?.cycleStart);
  }

  @Patch("packing-lists/:id/lines")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  updatePackingLines(
    @Param("id") id: string,
    @Body() body: { lines: Array<{ kitProductId: string; qtyApproved: number }> },
  ) {
    if (!Array.isArray(body?.lines)) throw new BadRequestException("lines array is required");
    return this.packingLists.updateLines(id, body.lines);
  }

  @Post("packing-lists/:id/approve")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  approvePackingList(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const userId = req.user?.id;
    if (!userId) throw new BadRequestException("User not found in request");
    return this.packingLists.approve(id, userId);
  }

  @Post("packing-lists/:id/done")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  markPackingDone(@Param("id") id: string) {
    return this.packingLists.markDone(id);
  }

  @Get("packing-lists/:id/export.xlsx")
  exportPackingList(@Param("id") id: string) {
    return this.packingLists.exportExcel(id);
  }

  @Get("factory/recommendations")
  factoryRecommendations() {
    return this.factoryOrders.getRecommendations();
  }

  @Get("factory/orders")
  listFactoryOrders(@Query("limit") limit?: string) {
    return this.factoryOrders.list(limit ? Number(limit) : 20);
  }

  @Get("factory/orders/:id")
  getFactoryOrder(@Param("id") id: string) {
    return this.factoryOrders.get(id);
  }

  @Post("factory/orders")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  createFactoryOrder(
    @Body()
    body: {
      lines?: Array<{ partProductId: string; qtyOrdered: number }>;
      note?: string;
    },
  ) {
    return this.factoryOrders.createFromRecommendations(body?.lines, body?.note);
  }

  @Patch("factory/orders/:id/status")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  updateFactoryStatus(@Param("id") id: string, @Body() body: { status: string }) {
    const valid = new Set(Object.values(FactoryOrderStatus));
    if (!valid.has(body.status as FactoryOrderStatus)) {
      throw new BadRequestException("Invalid status");
    }
    return this.factoryOrders.updateStatus(id, body.status as FactoryOrderStatus);
  }

  @Patch("factory/orders/:id/received")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  updateFactoryReceived(
    @Param("id") id: string,
    @Body() body: { lines: Array<{ partProductId: string; qtyReceived: number }> },
  ) {
    if (!Array.isArray(body?.lines)) throw new BadRequestException("lines array is required");
    return this.factoryOrders.updateReceived(id, body.lines);
  }

  @Get("factory/orders/:id/export.xlsx")
  exportFactoryOrder(@Param("id") id: string) {
    return this.factoryOrders.exportExcel(id);
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

  @Get("config/capacity")
  getCapacityConfig() {
    return this.mrpConfig.getCapacity();
  }

  @Patch("config/capacity")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async setCapacityConfig(@Body() body: { monthlyPartsQuota?: number }) {
    const capacity = await this.mrpConfig.setCapacity(body ?? {});
    const mrpRun = await this.planningRuns.runAndPersist(PlanningRunMode.FULL);
    return {
      ...capacity,
      mrpRunId: mrpRun.id,
      monthlyPartsQuota: mrpRun.monthlyPartsQuota,
      mrpSummary: mrpRun.summary,
      stale: mrpRun.stale,
    };
  }

  @Get("config/horizon")
  getHorizonConfig() {
    return this.mrpConfig.getHorizon();
  }

  @Patch("config/horizon")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async setHorizonConfig(
    @Body()
    body: {
      coverMonths?: number;
      velocityLookbackMonths?: number;
      safetyMonths?: number;
      warnCoverDays?: number;
      criticalCoverDays?: number;
      softPipelineFactor?: number;
      defaultPackLeadDays?: number;
    },
  ) {
    const horizon = await this.mrpConfig.setHorizon(body ?? {});
    const mrpRun = await this.planningRuns.runAndPersist(PlanningRunMode.FULL);
    return {
      ...horizon,
      mrpRunId: mrpRun.id,
      mrpSummary: mrpRun.summary,
      stale: mrpRun.stale,
    };
  }

  @Post("mrp/run")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  runMrp(@Body() body?: { mode?: string }) {
    const mode =
      body?.mode === "CRITICAL" ? PlanningRunMode.CRITICAL : PlanningRunMode.FULL;
    return this.planningRuns.runAndPersist(mode);
  }

  @Get("mrp/latest")
  getLatestMrp(@Query("mode") mode?: string) {
    // Default FULL — CRITICAL-only daily runs must not starve packaging/dashboard.
    const parsed =
      mode === "CRITICAL" ? PlanningRunMode.CRITICAL : PlanningRunMode.FULL;
    return this.planningRuns.getLatest(parsed);
  }

  @Get("mrp/critical")
  getMrpCritical() {
    return this.planningRuns.getCritical();
  }

  @Get("mrp/production-orders")
  getMrpProductionOrders(@Query("month") month?: string) {
    const parsed =
      month != null && month !== ""
        ? Number.parseInt(month, 10)
        : undefined;
    return this.planningRuns.getProductionOrders(
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }

  @Get("mrp/packaging")
  getMrpPackaging() {
    return this.planningRuns.getPackaging();
  }

  @Get("mrp/packing")
  getMrpPackingAlias() {
    return this.planningRuns.getPackaging();
  }

  @Get("mrp/semi-finished")
  getMrpSemiFinished() {
    return this.planningRuns.getSemiFinished();
  }

  @Get("mrp/forecast")
  getMrpForecast() {
    return this.demandForecast.getMrpForecastView();
  }

  @Get("mrp/factory")
  getMrpFactory() {
    return this.factoryOrders.getRecommendations();
  }

  @Post("mrp/lines/:id/create-batch")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  createBatchFromMrpLine(
    @Param("id") id: string,
    @Body() body?: { code?: string; qtyPlanned?: number; dueAt?: string },
  ) {
    return this.planningRuns.createBatchFromLine(id, body);
  }
}
