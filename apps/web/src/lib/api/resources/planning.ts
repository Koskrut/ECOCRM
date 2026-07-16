import { apiHttp } from "../client";

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

export type SnapshotFreshness = {
  snapshotId: string | null;
  postedAt: string | null;
  ageDays: number | null;
  maxAgeDays: number;
  isFresh: boolean;
  warning: string | null;
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
  kitProduct: { id: string; sku: string; name: string };
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

export type FactoryOrderLine = {
  id: string;
  partProductId: string;
  qtyOrdered: number;
  qtyReceived: number;
  partProduct: { id: string; sku: string; name: string };
};

export type FactoryOrder = {
  id: string;
  orderedAt: string;
  dueAt: string;
  status: "DRAFT" | "OPEN" | "PARTIAL" | "CLOSED" | "CANCELLED";
  note: string | null;
  lines?: FactoryOrderLine[];
  _count?: { lines: number };
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
  getFreshness: async (): Promise<SnapshotFreshness> => {
    const res = await apiHttp.get<SnapshotFreshness>("/planning/freshness");
    return res.data;
  },
  getDashboard: async (): Promise<PlanningDashboard> => {
    const res = await apiHttp.get<PlanningDashboard>("/planning/dashboard");
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
      throw new Error(text || `Upload failed (${res.status})`);
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
      throw new Error(text || `BOM import failed (${res.status})`);
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
    format?: "flat" | "onec_monthly_pivot";
    importBatchId: string;
    importedRows: number;
    resolvedRows: number;
    unresolvedSku: string[];
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
      throw new Error(text || `Sales history import failed (${res.status})`);
    }
    return res.json();
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
  approvePackingList: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.post(`/planning/packing-lists/${id}/approve`);
    return res.data;
  },
  markPackingDone: async (id: string): Promise<PackingList> => {
    const res = await apiHttp.post(`/planning/packing-lists/${id}/done`);
    return res.data;
  },
  exportPackingList: async (id: string) => {
    await downloadBlob(`/planning/packing-lists/${id}/export.xlsx`, `packing-list-${id.slice(0, 8)}.xlsx`);
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
  createFactoryOrder: async (payload?: {
    lines?: Array<{ partProductId: string; qtyOrdered: number }>;
    note?: string;
  }): Promise<FactoryOrder> => {
    const res = await apiHttp.post<FactoryOrder>("/planning/factory/orders", payload ?? {});
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
};
