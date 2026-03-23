import { apiHttp } from "../client";

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

export const planningApi = {
  getDemandRules: async () => {
    const res = await apiHttp.get("/planning/config/demand-rules");
    return res.data;
  },
  listSnapshots: async (limit = 20) => {
    const res = await apiHttp.get("/planning/inventory-snapshots", { params: { limit } });
    return res.data;
  },
  getLatestPostedSnapshot: async () => {
    const res = await apiHttp.get("/planning/inventory-snapshots/latest-posted");
    return res.data;
  },
  getLaunchRecommendations: async (horizonWeeks = 1) => {
    const res = await apiHttp.get("/planning/recommendations/launch", { params: { horizonWeeks } });
    return res.data;
  },
  getQcQueue: async () => {
    const res = await apiHttp.get("/planning/queues/qc");
    return res.data;
  },
  getPackingQueue: async () => {
    const res = await apiHttp.get("/planning/queues/packing");
    return res.data;
  },
  getAvailability: async (productId: string): Promise<PlanningAvailability> => {
    const res = await apiHttp.get(`/planning/availability/${productId}`);
    return res.data as PlanningAvailability;
  },
};

