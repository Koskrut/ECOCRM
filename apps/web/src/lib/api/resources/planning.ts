import { apiHttp } from "../client";

export type DemandRules = {
  hardStages: string[];
  softStages: string[];
  includeOrderItemsWithoutProductIdAsSoft: boolean;
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

export type KitCapacity = {
  kitProductId: string;
  maxBuildNow: number;
  bottleneckComponentId: string | null;
  components: Array<{
    componentProductId: string;
    qtyPerKit: number;
    available: number;
    ratio: number;
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
};

export type LaunchRecommendationsResponse = {
  horizonWeeks: number;
  unresolvedOrderItemIds: string[];
  recommendations: LaunchRecommendation[];
};

export const planningApi = {
  getDemandRules: async (): Promise<DemandRules> => {
    const res = await apiHttp.get<DemandRules>("/planning/config/demand-rules");
    return res.data;
  },
  updateDemandRules: async (payload: DemandRules): Promise<DemandRules> => {
    const res = await apiHttp.patch<DemandRules>("/planning/config/demand-rules", payload);
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
};

