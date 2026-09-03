import { apiHttp } from "../client";

export class PlanningUploadError extends Error {
  constructor(
    readonly kind: "file_too_large" | "generic",
    message: string,
  ) {
    super(message);
    this.name = "PlanningUploadError";
  }
}

/** Turn nginx/HTML error pages into a typed upload error (e.g. 413 body size). */
function throwOnUploadFailure(status: number, body: string, fallback: string): never {
  const text = body.trim();
  if (status === 413 || /413|Request Entity Too Large/i.test(text)) {
    throw new PlanningUploadError("file_too_large", "");
  }
  if (text.startsWith("<") || text.includes("<html")) {
    throw new PlanningUploadError("generic", `${fallback} (HTTP ${status})`);
  }
  throw new PlanningUploadError("generic", text || `${fallback} (HTTP ${status})`);
}

export function resolvePlanningUploadError(
  e: unknown,
  messages: { fileTooLarge: string; fallback: string },
): string {
  if (e instanceof PlanningUploadError) {
    if (e.kind === "file_too_large") return messages.fileTooLarge;
    return e.message || messages.fallback;
  }
  return e instanceof Error ? e.message : messages.fallback;
}

export type DemandRules = {
  hardStages: string[];
  softStages: string[];
  includeOrderItemsWithoutProductIdAsSoft: boolean;
};

export type PlanningSettings = {
  packCycleDays: number;
  packCapacityPerCycle: number;
  factoryLeadTimeDays: number;
  safetyStockWeeks: number;
  snapshotMaxAgeDays: number;
  demandMix: "HARD_PLUS_FORECAST_BEYOND_COVERED" | "MAX_FORECAST_HARD";
};

export type PlanningCapacityConfig = {
  monthlyPartsQuota: number;
};

export type PlanningHorizonConfig = {
  coverMonths: number;
  velocityLookbackMonths: number;
  safetyMonths: number;
  warnCoverDays: number;
  criticalCoverDays: number;
  softPipelineFactor: number;
  defaultPackLeadDays: number;
};

export type MrpLineType = "PRODUCTION" | "PACK" | "SEMI_REORDER" | "CRITICAL" | "CAN_PACK";

export type MrpRunLine = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  kind: string;
  lineType: MrpLineType;
  qty: number;
  suggestedLaunchQty: number;
  priority: number;
  monthBucket: number | null;
  coverDays: number | null;
  reason: string | null;
  details: Record<string, unknown>;
  batchId: string | null;
};

export type MrpRun = {
  id: string;
  mode: "FULL" | "CRITICAL";
  computedAt: string;
  coverMonths: number;
  monthlyPartsQuota: number;
  velocityLookbackMonths: number;
  snapshotId: string | null;
  summary: {
    criticalCount?: number;
    productionCount?: number;
    packCount?: number;
    semiCount?: number;
    canPackCount?: number;
    quotaUsedMonth0?: number;
    quotaOverflowCount?: number;
  };
  freshness: SnapshotFreshness | null;
  salesFreshness?: SalesFreshness | null;
  stale?: boolean;
  liveCapacity?: { monthlyPartsQuota: number };
  liveHorizon?: { coverMonths: number; velocityLookbackMonths: number };
  runCapacity?: {
    monthlyPartsQuota: number;
    coverMonths: number;
    velocityLookbackMonths: number;
  };
  lines: MrpRunLine[];
};

export type SnapshotFreshness = {
  snapshotId: string | null;
  postedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
};

export type SalesFreshness = {
  uploadId: string | null;
  postedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
  coverageMonths?: number | null;
  requiredCoverageMonths?: number | null;
};

export type PlanningFreshness = {
  snapshot: SnapshotFreshness;
  sales: SalesFreshness;
  mrpStale?: boolean;
  mrpStaleWarning?: string | null;
};

export type SalesHistoryUpload = {
  id: string;
  status: "STAGED" | "POSTED" | "VOID";
  note: string | null;
  importedAt: string;
  postedAt: string | null;
  _count?: { lines: number };
};

export type ActionListPriority = "CRITICAL" | "HARD" | "FORECAST" | "NORMAL";

export type ActionListItem = {
  lineId: string;
  productId: string;
  sku: string;
  name: string;
  qty: number;
  desiredDate: string;
  reason: string;
  priority: ActionListPriority;
  lineType: MrpLineType;
  monthOffset?: number;
  canCreateBatch?: boolean;
  blockers?: string[];
  packNeed?: number;
  maxFromParts?: number;
  bottleneckSku?: string | null;
};

export type ForecastBreakdown = {
  hardNeed: number;
  softNeed: number;
  forecastDemand: number;
  safetyStock: number;
  available?: number;
  expectedWip?: number;
  grossNeed?: number;
  netNeed?: number;
  avgMonthlySold: number;
  velocitySource: "sales_history" | "crm_orders" | "override";
};

export type MrpForecastRow = {
  productId: string;
  sku: string;
  name: string;
  kind: string;
  monthlyHistory: Array<{ yearMonth: string; qty: number }>;
  avgMonthlySold: number;
  forecastDemand: number;
  hardNeed: number;
  softNeed: number;
  safetyStock: number;
  velocitySource: "sales_history" | "crm_orders" | "override";
  breakdown: ForecastBreakdown;
};

export type MrpForecastView = {
  horizon: PlanningHorizonConfig;
  salesFreshness: SalesFreshness;
  salesUploadId: string | null;
  rows: MrpForecastRow[];
};

export type PlanningAvailability = {
  asOfSnapshotId: string | null;
  asOfSnapshotDate: string | null;
  productId: string;
  warehouseId: string | null;
  physical: number;
  hardReserved: number;
  softReserved: number;
  available: number;
  expectedOutput: number;
};

export type SnapshotLine = {
  id: string;
  snapshotId: string;
  warehouseId: string | null;
  productId: string | null;
  skuRaw: string;
  qty: number;
  warehouseRaw: string | null;
  createdAt: string;
};

export type InventorySnapshot = {
  id: string;
  source: "MANUAL_PASTE" | "FILE_UPLOAD";
  status: "STAGED" | "POSTED" | "VOID";
  note: string | null;
  importedAt: string;
  importedById: string;
  postedAt: string | null;
  postedById: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: SnapshotLine[];
  _count?: { lines: number };
};

export type UploadSnapshotResult = {
  snapshot: InventorySnapshot;
  rowsInFile: number;
  keptRows: number;
  skippedIrrelevant: number;
  relevantSkuCount: number;
  unresolvedSku: string[];
  unresolvedWarehouses: string[];
};

export type BomLine = {
  id: string;
  componentProductId: string;
  qtyPerKit: string | number;
  scrapPct: string | number | null;
  sortOrder: number;
  component?: { id: string; sku: string; name: string; kind?: string | null };
};

export type ActiveBom = {
  id: string;
  kitProductId: string;
  revision: number;
  effectiveFrom: string;
  isActive: boolean;
  kitProduct?: { id: string; sku: string; name: string; kind?: string | null };
  lines: BomLine[];
};

export type KitBomListLine = {
  componentProductId: string;
  componentSku: string;
  componentName: string;
  componentKind: string;
  qtyPerKit: number;
  scrapPct: number | null;
  sortOrder: number;
  available: number;
  isBottleneck: boolean;
};

export type KitBomListItem = {
  kitProductId: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  isActive: boolean;
  bomId: string | null;
  revision: number | null;
  effectiveFrom: string | null;
  linesCount: number;
  paretoClass: "A" | "B" | "C";
  xyzClass: "X" | "Y" | "Z" | null;
  demandCv: number | null;
  xyzReason: "stable" | "variable" | "intermittent" | "insufficient_history";
  xyzSource: "crm_weeks" | "sales_months" | null;
  stockFinished: number;
  stockNow: number;
  coverTarget: number;
  targetStock: number;
  maxBuildNow: number;
  canPackNow: number;
  toWork: number;
  weeksOfCover: number | null;
  coverTone: "critical" | "warn" | "ok";
  avgMonthlySold: number;
  hardNeed: number;
  weeklyPackNeed: number;
  waitingOrders: number;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  lines: KitBomListLine[];
};

export type BomImportRowError = {
  rowNumber: number;
  kitSku: string;
  componentSku: string;
  reason: string;
};

export type BomImportResult = {
  format?: "flat" | "suprex";
  sheetsProcessed?: string[];
  skippedSheets?: string[];
  parsedRowCount?: number;
  importedKitCount: number;
  importedLineCount: number;
  importedKits: Array<{
    kitSku: string;
    kitName: string | null;
    revision: number;
    lines: number;
  }>;
  createdKitCount?: number;
  createdKits?: Array<{ sku: string; name: string; id: string }>;
  createdPartCount?: number;
  createdParts?: Array<{ id: string; sku: string; name: string }>;
  skippedKitCount?: number;
  skippedKits?: Array<{ kitSku: string; reason: string; unresolvedComponents: string[] }>;
  unresolvedKitSku: string[];
  unresolvedComponentSku: string[];
  rowErrors: BomImportRowError[];
};

export type KitCapacity = {
  kitProductId: string;
  maxBuildNow: number;
  bottleneckComponentId: string | null;
  components: Array<{
    componentProductId: string;
    qtyPerKit: number;
    available: number;
    ratio: number;
    constrainsCapacity?: boolean;
    product: { sku: string; name: string } | null;
  }>;
};

export type ProductionBatch = {
  id: string;
  code: string;
  productId: string;
  orderId: string | null;
  qtyPlanned: number;
  qtyGood: number;
  qtyScrap: number;
  status: string;
  currentStageId: string | null;
  dueAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  product?: { id?: string; sku: string; name: string };
  currentStage?: { id?: string; code: string; name: string } | null;
  movements?: Array<{
    id?: string;
    enteredAt?: string;
    stage?: { code: string; name: string };
  }>;
};

export type LaunchRecommendation = {
  productId: string;
  hardNeed: number;
  softNeed: number;
  available: number;
  expectedOutput: number;
  deficit: number;
  suggestedLaunchQty: number;
  reason: string;
  horizonWeeks: number;
  product: { sku: string; name: string } | null;
};

export type LaunchRecommendationsResponse = {
  horizonWeeks: number;
  unresolvedOrderItemIds: string[];
  recommendations: LaunchRecommendation[];
};

export type ForecastRow = {
  productId: string;
  sku: string;
  name: string;
  horizonDays: number;
  qty: number;
  method: string;
  computedAt: string;
};

export type PackingListLine = {
  id: string;
  packingListId: string;
  kitProductId: string;
  qtySuggested: number;
  qtyApproved: number;
  maxFromParts: number;
  priority: number;
  hardNeed: number;
  forecastNeed: number;
  stockKits: number;
  kitProduct: { id: string; sku: string; name: string; kind?: string };
  /** Live from getKitCapacity when list is loaded. */
  bottleneckSku?: string | null;
  bottleneckName?: string | null;
  parts?: Array<{
    sku: string;
    name: string;
    qtyPerKit: number;
    available: number;
    isBottleneck: boolean;
  }>;
  targetPack?: number;
  partsBlocked?: boolean;
  coverTarget?: number;
  targetStock?: number;
  stockNow?: number;
  canPackNow?: number;
  toWork?: number;
  suggestedFactoryPartQty?: number;
};

export type PackingList = {
  id: string;
  cycleStart: string;
  cycleEnd: string;
  status: "DRAFT" | "APPROVED" | "DONE";
  capacityUsed: number;
  capacityLimit: number;
  snapshotId: string | null;
  note: string | null;
  approvedAt: string | null;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
  lines?: PackingListLine[];
  _count?: { lines: number };
  snapshot?: { id: string; postedAt: string | null } | null;
};

export type FactoryRecommendation = {
  partProductId: string;
  sku: string;
  name: string;
  grossRequirement: number;
  onHand: number;
  openPoQty: number;
  safetyStock: number;
  netRequirement: number;
  suggestedQty: number;
};

export type FactoryLineTrackingStatus = "received" | "on_track" | "due_soon" | "overdue";

export type FactoryOrderLine = {
  id: string;
  partProductId: string;
  qtyOrdered: number;
  qtyReceived: number;
  dueAt?: string | null;
  effectiveDueAt?: string;
  trackingStatus?: FactoryLineTrackingStatus;
  partProduct: { id: string; sku: string; name: string };
};

export type FactoryOrder = {
  id: string;
  orderedAt: string;
  dueAt: string;
  status: "DRAFT" | "OPEN" | "PARTIAL" | "CLOSED" | "CANCELLED";
  note: string | null;
  externalCode?: string | null;
  approvedAt?: string | null;
  approvedById?: string | null;
  lines?: FactoryOrderLine[];
  _count?: { lines: number };
  overdueLineCount?: number;
  nearestLineDueYmd?: string | null;
};

export type FactoryTrackingRow = {
  orderId: string;
  externalCode: string | null;
  orderStatus: string;
  lineId: string;
  partProductId: string;
  sku: string;
  name: string;
  qtyOrdered: number;
  qtyReceived: number;
  dueAt: string;
  trackingStatus: FactoryLineTrackingStatus;
};

export type PlanningDashboard = {
  settings: PlanningSettings;
  freshness: SnapshotFreshness;
  overallDaysOfCover: number | null;
  packCycleDays: number;
  packCapacityPerCycle: number;
  latestDraftPacking: PackingList | null;
  latestApprovedPacking: PackingList | null;
  openFactoryOrders: number;
  bottleneckRiskCount: number;
  kitCoverage: Array<{
    productId: string;
    sku: string;
    name: string;
    stock: number;
    weeklyDemand: number;
    daysOfCover: number | null;
    maxBuildNow: number;
    bottleneckComponentId: string | null;
  }>;
};

export type StockProjection = {
  freshness: SnapshotFreshness;
  receiptWeek: number;
  points: Array<{
    week: number;
    kitsTotal: number;
    partsTotal: number;
    kitDaysOfCover: number | null;
  }>;
};

export type KitPortfolioKit = {
  productId: string;
  sku: string;
  name: string;
  revenue: number;
  sharePct: number;
  cumulativePct: number;
  paretoClass: "A" | "B" | "C";
  inPareto80: boolean;
  xyzClass: "X" | "Y" | "Z" | null;
  demandCv: number | null;
  xyzReason: "stable" | "variable" | "intermittent" | "insufficient_history";
  xyzSource: "crm_weeks" | "sales_months" | null;
  classificationPeriods: number;
  pile: "ending" | "ok" | "idle";
  endingReason: "orders" | "cover" | "both" | null;
  stockFinished: number;
  maxBuildNow: number;
  weeksOfCover: number | null;
  coverTone: "critical" | "warn" | "ok";
  avgMonthlySold: number;
  hardNeed: number;
  waitingOrders: number;
  suggestedPackQty: number;
  suggestedPackTargetQty: number;
  weeklyPackNeed: number;
  alreadyInRequest: number;
  coverTarget: number;
  targetStock: number;
  stockNow: number;
  canPackNow: number;
  toWork: number;
  suggestedFactoryQty: number;
  bottleneckComponentId: string | null;
  bottleneckSku: string | null;
  bottleneckName: string | null;
  monthlyHistory: Array<{ yearMonth: string; qty: number }>;
  components: Array<{
    componentProductId: string;
    sku: string;
    name: string;
    qtyPerKit: number;
    available: number;
    isBottleneck: boolean;
  }>;
};

export type StockoutRow = {
  productId: string;
  sku: string;
  name: string;
  kind: "KIT" | "PART";
  inPareto80: boolean;
};

export type KitPortfolioView = {
  freshness: SnapshotFreshness;
  salesFreshness: SalesFreshness;
  currency: string;
  lookbackMonths: number;
  warnWeeks: number;
  criticalWeeks: number;
  week: {
    packingListId: string | null;
    packingStatus: "DRAFT" | "APPROVED" | "DONE" | null;
    used: number;
    limit: number;
    factoryDraftId: string | null;
  };
  summary: {
    packableToday: number;
    blocked: number;
    packableAllKits: number;
    blockedAllKits: number;
    ending: number;
    pareto80Count: number;
    axEnding: number;
  };
  classMatrix: Array<{
    paretoClass: "A" | "B" | "C";
    xyzClass: "X" | "Y" | "Z";
    skuCount: number;
    revenue: number;
    endingCount: number;
  }>;
  stockouts: {
    zeroCount: number;
    paretoZeroCount: number;
    zeroKits: StockoutRow[];
    zeroParts: StockoutRow[];
    zeroFinishedBlocked: StockoutRow[];
    zeroFinishedBuildable: StockoutRow[];
    paretoZeroFinishedBlocked: number;
    paretoZeroFinishedBuildable: number;
  };
  draftRequests: { packing: number; factory: number };
  kits: KitPortfolioKit[];
  sharedBottlenecks: Array<{
    componentId: string;
    sku: string;
    name: string;
    kitIds: string[];
    kitCount: number;
    suggestedQty: number;
  }>;
};

export type PlanningProductParamsRow = {
  productId: string;
  sku: string;
  name: string;
  kind: "KIT" | "PART";
  safetyStock: number;
  productionLeadDays: number;
  packLeadDays: number | null;
  isPlanned: boolean;
  monthlyForecastOverride: number | null;
  demandMode: "AUTO" | "MANUAL";
  paretoClass: "A" | "B" | "C" | null;
  xyzClass: "X" | "Y" | "Z" | null;
  xyzReason: string | null;
  xyzSource: string | null;
  demandCv: number | null;
};

async function downloadBlob(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const planningApi = {
  getDemandRules: async (): Promise<DemandRules> => {
    const res = await apiHttp.get<DemandRules>("/planning/config/demand-rules");
    return res.data;
  },
  updateDemandRules: async (payload: DemandRules): Promise<DemandRules> => {
    const res = await apiHttp.patch<DemandRules>("/planning/config/demand-rules", payload);
    return res.data;
  },
  getSettings: async (): Promise<PlanningSettings> => {
    const res = await apiHttp.get<PlanningSettings>("/planning/config/settings");
    return res.data;
  },
  updateSettings: async (payload: Partial<PlanningSettings>): Promise<PlanningSettings> => {
    const res = await apiHttp.patch<PlanningSettings>("/planning/config/settings", payload);
    return res.data;
  },
  getFreshness: async (): Promise<PlanningFreshness> => {
    const res = await apiHttp.get<PlanningFreshness>("/planning/freshness");
    return res.data;
  },
  getDashboard: async (): Promise<PlanningDashboard> => {
    const res = await apiHttp.get<PlanningDashboard>("/planning/dashboard");
    return res.data;
  },
  getKitPortfolio: async (): Promise<KitPortfolioView> => {
    const res = await apiHttp.get<KitPortfolioView>("/planning/kit-portfolio");
    return res.data;
  },
  listProductParams: async (params?: {
    kind?: "KIT" | "PART";
    q?: string;
  }): Promise<PlanningProductParamsRow[]> => {
    const res = await apiHttp.get<PlanningProductParamsRow[]>("/planning/product-params", {
      params,
    });
    return res.data;
  },
  patchProductParams: async (
    productId: string,
    payload: {
      safetyStock?: number;
      productionLeadDays?: number;
      packLeadDays?: number | null;
      isPlanned?: boolean;
      monthlyForecastOverride?: number | null;
    },
  ): Promise<PlanningProductParamsRow> => {
    const res = await apiHttp.patch<PlanningProductParamsRow>(
      `/planning/product-params/${productId}`,
      payload,
    );
    return res.data;
  },
  getProjection: async (weeks = [2, 4, 8, 12]): Promise<StockProjection> => {
    const res = await apiHttp.get<StockProjection>("/planning/projection", {
      params: { weeks: weeks.join(",") },
    });
    return res.data;
  },
  listSnapshots: async (limit = 20): Promise<InventorySnapshot[]> => {
    const res = await apiHttp.get<InventorySnapshot[]>("/planning/inventory-snapshots", {
      params: { limit },
    });
    return res.data;
  },
  getLatestPostedSnapshot: async (): Promise<InventorySnapshot | null> => {
    const res = await apiHttp.get<InventorySnapshot | null>(
      "/planning/inventory-snapshots/latest-posted",
    );
    return res.data;
  },
  uploadSnapshot: async (file: File, note?: string): Promise<UploadSnapshotResult> => {
    const formData = new FormData();
    formData.append("file", file);
    if (note) formData.append("note", note);
    const res = await fetch("/api/planning/inventory-snapshots/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throwOnUploadFailure(res.status, text, "Snapshot upload failed");
    }
    return res.json() as Promise<UploadSnapshotResult>;
  },
  postSnapshot: async (snapshotId: string): Promise<InventorySnapshot> => {
    const res = await apiHttp.post<InventorySnapshot>(
      `/planning/inventory-snapshots/${snapshotId}/post`,
    );
    return res.data;
  },
  getLaunchRecommendations: async (
    horizonWeeks = 1,
  ): Promise<LaunchRecommendationsResponse> => {
    const res = await apiHttp.get<LaunchRecommendationsResponse>(
      "/planning/recommendations/launch",
      { params: { horizonWeeks } },
    );
    return res.data;
  },
  getQcQueue: async (): Promise<ProductionBatch[]> => {
    const res = await apiHttp.get<ProductionBatch[]>("/planning/queues/qc");
    return res.data;
  },
  getPackingQueue: async (): Promise<ProductionBatch[]> => {
    const res = await apiHttp.get<ProductionBatch[]>("/planning/queues/packing");
    return res.data;
  },
  getAvailability: async (productId: string): Promise<PlanningAvailability> => {
    const res = await apiHttp.get(`/planning/availability/${productId}`);
    return res.data as PlanningAvailability;
  },
  listBoms: async (params?: { q?: string }): Promise<KitBomListItem[]> => {
    const res = await apiHttp.get<KitBomListItem[]>("/planning/boms", {
      params: params?.q ? { q: params.q } : undefined,
    });
    return res.data;
  },
  getBom: async (kitProductId: string): Promise<ActiveBom> => {
    const res = await apiHttp.get<ActiveBom>(`/planning/boms/${kitProductId}`);
    return res.data;
  },
  createBomRevision: async (
    kitProductId: string,
    payload: { lines: Array<{ componentProductId: string; qtyPerKit: number; scrapPct?: number; sortOrder?: number }> },
  ): Promise<ActiveBom> => {
    const res = await apiHttp.post<ActiveBom>(`/planning/boms/${kitProductId}/revision`, payload);
    return res.data;
  },
  importBomFile: async (file: File): Promise<BomImportResult> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/planning/boms/import", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throwOnUploadFailure(res.status, text, "BOM import failed");
    }
    return res.json() as Promise<BomImportResult>;
  },
  getKitCapacity: async (kitProductId: string): Promise<KitCapacity> => {
    const res = await apiHttp.get<KitCapacity>(`/planning/kits/${kitProductId}/capacity`);
    return res.data;
  },
  listBatches: async (): Promise<ProductionBatch[]> => {
    const res = await apiHttp.get<ProductionBatch[]>("/planning/production/batches");
    return res.data;
  },
  createBatch: async (payload: {
    code: string;
    productId: string;
    qtyPlanned: number;
    dueAt?: string;
    orderId?: string;
  }): Promise<ProductionBatch> => {
    const res = await apiHttp.post<ProductionBatch>("/planning/production/batches", payload);
    return res.data;
  },
  moveBatchStage: async (
    batchId: string,
    payload: {
      toStageCode: string;
      qtyInStage?: number;
      qtyGoodIncrement?: number;
      qtyScrapIncrement?: number;
      note?: string;
    },
  ): Promise<ProductionBatch> => {
    const res = await apiHttp.post<ProductionBatch>(
      `/planning/production/batches/${batchId}/move-stage`,
      payload,
    );
    return res.data;
  },
  runWeeklyPlan: async (): Promise<{
    weekStart: string;
    qcQueue: number;
    packQueue: number;
    launch: number;
    mrpRunId?: string;
  }> => {
    const res = await apiHttp.post("/planning/jobs/weekly-plan/run");
    return res.data;
  },
  listForecast: async (horizonDays?: number): Promise<ForecastRow[]> => {
    const res = await apiHttp.get<ForecastRow[]>("/planning/forecast", {
      params: horizonDays ? { horizonDays } : undefined,
    });
    return res.data;
  },
  recomputeForecast: async (): Promise<{
    computedProducts: number;
    horizons: number[];
    method: string;
  }> => {
    const res = await apiHttp.post("/planning/forecast/recompute");
    return res.data;
  },
  importSalesHistory: async (
    file: File,
  ): Promise<{
    format?: "flat" | "onec_monthly_pivot" | "flat_month_columns";
    uploadId: string;
    importedRows: number;
    resolvedRows: number;
    unresolvedSku: string[];
    status: string;
  }> => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/planning/forecast/sales-history/import", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throwOnUploadFailure(res.status, text, "Sales history import failed");
    }
    return res.json();
  },
  uploadSalesHistory: async (
    file: File,
    note?: string,
  ): Promise<{
    upload: SalesHistoryUpload;
    format: string;
    importedRows: number;
    resolvedRows: number;
    unresolvedSku: string[];
  }> => {
    const formData = new FormData();
    formData.append("file", file);
    if (note) formData.append("note", note);
    const res = await fetch("/api/planning/sales-history/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      const text = await res.text();
      throwOnUploadFailure(res.status, text, "Sales history upload failed");
    }
    return res.json();
  },
  postSalesHistory: async (uploadId: string): Promise<SalesHistoryUpload> => {
    const res = await apiHttp.post<SalesHistoryUpload>(`/planning/sales-history/${uploadId}/post`);
    return res.data;
  },
  getLatestPostedSalesHistory: async (): Promise<SalesHistoryUpload | null> => {
    const res = await apiHttp.get<SalesHistoryUpload | null>("/planning/sales-history/latest-posted");
    return res.data;
  },
  getMrpForecast: async (): Promise<MrpForecastView> => {
    const res = await apiHttp.get<MrpForecastView>("/planning/mrp/forecast");
    return res.data;
  },
  getMrpFactory: async (): Promise<{
    freshness: SnapshotFreshness;
    dueAt: string;
    leadTimeDays: number;
    recommendations: FactoryRecommendation[];
  }> => {
    const res = await apiHttp.get("/planning/mrp/factory");
    return res.data;
  },
  listPackingLists: async (limit = 20): Promise<PackingList[]> => {
    const res = await apiHttp.get<PackingList[]>("/planning/packing-lists", { params: { limit } });
    return res.data;
  },
  getPackingList: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.get<PackingList>(`/planning/packing-lists/${id}`);
    return res.data;
  },
  proposePackingList: async (cycleStart?: string): Promise<{ list: PackingList; freshness: SnapshotFreshness }> => {
    const res = await apiHttp.post("/planning/packing-lists/propose", { cycleStart });
    return res.data;
  },
  updatePackingLines: async (
    id: string,
    lines: Array<{ kitProductId: string; qtyApproved: number }>,
  ): Promise<PackingList> => {
    const res = await apiHttp.patch(`/planning/packing-lists/${id}/lines`, { lines });
    return res.data;
  },
  setPackingKitQty: async (
    id: string,
    kitProductId: string,
    qtyApproved: number,
  ): Promise<PackingList> => {
    const res = await apiHttp.patch(`/planning/packing-lists/${id}/kit-qty`, {
      kitProductId,
      qtyApproved,
    });
    return res.data;
  },
  approvePackingList: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.post(`/planning/packing-lists/${id}/approve`);
    return res.data;
  },
  markPackingDone: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.post(`/planning/packing-lists/${id}/done`);
    return res.data;
  },
  updatePackingDueAt: async (id: string, cycleEnd: string): Promise<PackingList> => {
    const res = await apiHttp.patch<PackingList>(`/planning/packing-lists/${id}/due-at`, { cycleEnd });
    return res.data;
  },
  exportPackingList: async (id: string) => {
    await downloadBlob(`/planning/packing-lists/${id}/export.xlsx`, `packing-list-${id.slice(0, 8)}.xlsx`);
  },
  deletePackingList: async (id: string): Promise<{ deleted: boolean; id: string }> => {
    const res = await apiHttp.delete(`/planning/packing-lists/${id}`);
    return res.data;
  },
  deletePackingLine: async (id: string, lineId: string): Promise<PackingList> => {
    const res = await apiHttp.delete(`/planning/packing-lists/${id}/lines/${lineId}`);
    return res.data;
  },
  reopenPackingList: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.post(`/planning/packing-lists/${id}/reopen`);
    return res.data;
  },
  getFactoryRecommendations: async (): Promise<{
    freshness: SnapshotFreshness;
    dueAt: string;
    leadTimeDays: number;
    recommendations: FactoryRecommendation[];
  }> => {
    const res = await apiHttp.get("/planning/factory/recommendations");
    return res.data;
  },
  listFactoryOrders: async (limit = 20): Promise<FactoryOrder[]> => {
    const res = await apiHttp.get<FactoryOrder[]>("/planning/factory/orders", { params: { limit } });
    return res.data;
  },
  getFactoryOrder: async (id: string): Promise<FactoryOrder> => {
    const res = await apiHttp.get<FactoryOrder>(`/planning/factory/orders/${id}`);
    return res.data;
  },
  createFactoryOrder: async (payload?: {
    lines?: Array<{ partProductId: string; qtyOrdered: number; dueAt?: string | null }>;
    note?: string;
    dueAt?: string;
  }): Promise<FactoryOrder> => {
    const res = await apiHttp.post<FactoryOrder>("/planning/factory/orders", payload ?? {});
    return res.data;
  },
  updateFactoryLines: async (
    id: string,
    lines: Array<{ partProductId: string; qtyOrdered: number; dueAt?: string | null }>,
  ): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(`/planning/factory/orders/${id}/lines`, { lines });
    return res.data;
  },
  addFactoryLine: async (
    id: string,
    body: { partProductId: string; qtyOrdered: number; dueAt?: string | null },
  ): Promise<FactoryOrder> => {
    const res = await apiHttp.post<FactoryOrder>(`/planning/factory/orders/${id}/lines`, body);
    return res.data;
  },
  deleteFactoryLine: async (id: string, lineId: string): Promise<FactoryOrder> => {
    const res = await apiHttp.delete<FactoryOrder>(`/planning/factory/orders/${id}/lines/${lineId}`);
    return res.data;
  },
  deleteFactoryOrder: async (id: string): Promise<{ deleted: boolean; id: string }> => {
    const res = await apiHttp.delete(`/planning/factory/orders/${id}`);
    return res.data;
  },
  updateFactoryLine: async (
    id: string,
    lineId: string,
    body: { qtyOrdered?: number; dueAt?: string | null },
  ): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(
      `/planning/factory/orders/${id}/lines/${lineId}`,
      body,
    );
    return res.data;
  },
  updateFactoryLineDueAt: async (
    id: string,
    lineId: string,
    dueAt: string,
  ): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(
      `/planning/factory/orders/${id}/lines/${lineId}/due-at`,
      { dueAt },
    );
    return res.data;
  },
  getFactoryTracking: async (overdueOnly = false): Promise<{ rows: FactoryTrackingRow[] }> => {
    const res = await apiHttp.get<{ rows: FactoryTrackingRow[] }>("/planning/factory/tracking", {
      params: overdueOnly ? { overdueOnly: "1" } : undefined,
    });
    return res.data;
  },
  approveFactoryOrder: async (id: string): Promise<FactoryOrder> => {
    const res = await apiHttp.post<FactoryOrder>(`/planning/factory/orders/${id}/approve`);
    return res.data;
  },
  updateFactoryExternalCode: async (id: string, externalCode: string): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(`/planning/factory/orders/${id}/external-code`, {
      externalCode,
    });
    return res.data;
  },
  updateFactoryDueAt: async (id: string, dueAt: string): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(`/planning/factory/orders/${id}/due-at`, { dueAt });
    return res.data;
  },
  updateFactoryStatus: async (id: string, status: FactoryOrder["status"]): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(`/planning/factory/orders/${id}/status`, { status });
    return res.data;
  },
  updateFactoryReceived: async (
    id: string,
    lines: Array<{ partProductId: string; qtyReceived: number }>,
  ): Promise<FactoryOrder> => {
    const res = await apiHttp.patch<FactoryOrder>(`/planning/factory/orders/${id}/received`, { lines });
    return res.data;
  },
  exportFactoryOrder: async (id: string) => {
    await downloadBlob(`/planning/factory/orders/${id}/export.xlsx`, `factory-order-${id.slice(0, 8)}.xlsx`);
  },
  getCapacityConfig: async (): Promise<PlanningCapacityConfig> => {
    const res = await apiHttp.get<PlanningCapacityConfig>("/planning/config/capacity");
    return res.data;
  },
  updateCapacityConfig: async (
    payload: Partial<PlanningCapacityConfig>,
  ): Promise<PlanningCapacityConfig & { mrpRunId?: string; mrpSummary?: MrpRun["summary"] }> => {
    const res = await apiHttp.patch("/planning/config/capacity", payload);
    return res.data;
  },
  getHorizonConfig: async (): Promise<PlanningHorizonConfig> => {
    const res = await apiHttp.get<PlanningHorizonConfig>("/planning/config/horizon");
    return res.data;
  },
  updateHorizonConfig: async (
    payload: Partial<PlanningHorizonConfig>,
  ): Promise<PlanningHorizonConfig & { mrpRunId?: string; mrpSummary?: MrpRun["summary"] }> => {
    const res = await apiHttp.patch("/planning/config/horizon", payload);
    return res.data;
  },
  runMrp: async (mode: "FULL" | "CRITICAL" = "FULL"): Promise<MrpRun> => {
    const res = await apiHttp.post<MrpRun>("/planning/mrp/run", { mode });
    return res.data;
  },
  getLatestMrp: async (mode?: "FULL" | "CRITICAL"): Promise<MrpRun | null> => {
    const res = await apiHttp.get<MrpRun | null>("/planning/mrp/latest", {
      params: mode ? { mode } : undefined,
    });
    return res.data;
  },
  getMrpCritical: async (): Promise<{
    runId: string | null;
    computedAt: string | null;
    freshness?: SnapshotFreshness | null;
    summary?: MrpRun["summary"];
    lines: MrpRunLine[];
  }> => {
    const res = await apiHttp.get("/planning/mrp/critical");
    return res.data;
  },
  getMrpProductionOrders: async (
    month?: number,
  ): Promise<{
    runId: string | null;
    computedAt: string | null;
    monthlyPartsQuota: number | null;
    quotaUsedMonth0?: number;
    lines: MrpRunLine[];
    items: ActionListItem[];
  }> => {
    const res = await apiHttp.get("/planning/mrp/production-orders", {
      params: month != null ? { month } : undefined,
    });
    return res.data;
  },
  getMrpPackaging: async (): Promise<{
    runId: string | null;
    computedAt: string | null;
    needPack: MrpRunLine[];
    canPack: MrpRunLine[];
    needItems: ActionListItem[];
    canItems: ActionListItem[];
    blockedItems: ActionListItem[];
    items: ActionListItem[];
  }> => {
    const res = await apiHttp.get("/planning/mrp/packaging");
    return res.data;
  },
  getMrpSemiFinished: async (): Promise<{
    runId: string | null;
    computedAt: string | null;
    lines: MrpRunLine[];
  }> => {
    const res = await apiHttp.get("/planning/mrp/semi-finished");
    return res.data;
  },
  createBatchFromMrpLine: async (
    lineId: string,
    payload?: { code?: string; qtyPlanned?: number; dueAt?: string },
  ): Promise<{ lineId: string; batch: ProductionBatch }> => {
    const res = await apiHttp.post(`/planning/mrp/lines/${lineId}/create-batch`, payload ?? {});
    return res.data;
  },
  getToday: async (): Promise<PlanningTodayView> => {
    const res = await apiHttp.get<PlanningTodayView>("/planning/today");
    return res.data;
  },
};

export type TodaySuggestedAction = "pack" | "production" | "factory";

export type TodayBurningComponent = {
  sku: string;
  name: string;
  availableQty: number;
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

export type PlanningDueReminder = {
  id: string;
  kind: "factory" | "packing";
  dueAt: string;
  status: string;
  label: string;
  isOverdue: boolean;
  lineCount: number;
  totalQty: number;
  overdueLineCount?: number;
  overdueSkus?: string[];
};

export type TodayAwaitingStockPrimaryAction = "pack" | "production" | "factory";

export type TodayAwaitingStockOrderLine = {
  orderItemId: string;
  orderId: string;
  orderNumber: string;
  qtyRemaining: number;
  availableQty: number | null;
  stockReadiness: "NONE" | "PARTIAL" | "FULL" | null;
};

export type TodayAwaitingStockGroup = {
  groupKey: string;
  productId: string | null;
  sku: string;
  name: string;
  totalQtyRemaining: number;
  availableQty: number | null;
  stockGap: number;
  maxFromParts: number;
  canAssemble: number;
  primaryAction: TodayAwaitingStockPrimaryAction;
  orderCount: number;
  orders: TodayAwaitingStockOrderLine[];
};

export type TodayAwaitingStockView = {
  summary: {
    skuCount: number;
    orderCount: number;
    totalQty: number;
    gapSkuCount: number;
    gapQty: number;
    coveredSkuCount: number;
    coveredQty: number;
  };
  groups: TodayAwaitingStockGroup[];
};

export type PlanningTodayView = {
  freshness: PlanningFreshness;
  mrpComputedAt: string | null;
  quota: { used: number; total: number };
  packSummary: { positionCount: number; totalQty: number };
  makeSummary: { positionCount: number; totalQty: number };
  burning: TodayBurningItem[];
  dueReminders: PlanningDueReminder[];
  awaitingStock: TodayAwaitingStockView;
};
