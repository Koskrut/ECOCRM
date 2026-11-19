import { apiHttp } from "@/lib/api/client";

export type OfficeToolsConfig = {
  isEnabled: boolean;
  baseUrl: string;
  stockId?: number;
  empId?: number;
  managerId?: number;
  codeId1?: number;
  currId?: number;
  configuredByUserId?: string;
};

export type OfficeToolsStatus = {
  active: boolean;
  unmatchedReceipts: number;
  entities: Record<
    string,
    {
      lastSyncAt?: string | null;
      lastRunAt?: string | null;
      status?: string | null;
      error?: string | null;
      lastCursor?: string | null;
    }
  >;
};

export const officeToolsApi = {
  getConfig() {
    return apiHttp.get<OfficeToolsConfig>("/settings/office-tools");
  },
  patchConfig(body: Partial<OfficeToolsConfig>) {
    return apiHttp.patch<OfficeToolsConfig>("/settings/office-tools", body);
  },
  getStatus() {
    return apiHttp.get<OfficeToolsStatus>("/settings/office-tools/status");
  },
  syncAll() {
    return apiHttp.post("/integrations/office-tools/sync", {});
  },
  syncStock() {
    return apiHttp.post("/integrations/office-tools/sync/stock", {});
  },
  syncPayments() {
    return apiHttp.post("/integrations/office-tools/sync/payments", {});
  },
  syncReceivables() {
    return apiHttp.post("/integrations/office-tools/sync/receivables", {});
  },
  listUnmatched(limit = 100) {
    return apiHttp.get(`/integrations/office-tools/receipts/unmatched`, {
      params: { limit },
    });
  },
  matchReceipt(id: string, orderId: string) {
    return apiHttp.post(`/integrations/office-tools/receipts/${id}/match`, { orderId });
  },
};

/** Best-effort: returns true only when OT is enabled and reachable. */
export async function fetchOfficeToolsActive(): Promise<boolean> {
  try {
    const res = await officeToolsApi.getStatus();
    return Boolean(res.data?.active);
  } catch {
    try {
      const res = await officeToolsApi.getConfig();
      return Boolean(res.data?.isEnabled);
    } catch {
      return false;
    }
  }
}
