import { apiHttp } from "../client";

export type ReceivablesReconcileStatus =
  | "ALIGNED"
  | "DELTA_1C_MORE"
  | "DELTA_CRM_MORE"
  | "ONLY_1C"
  | "ONLY_CRM";

export type ReceivablesSnapshot = {
  id: string;
  snapshotDate: string;
  importedAt: string;
  importedById: string;
  note: string | null;
  total1C: number;
  totalCRM: number;
  deltaCount: number;
  alignedCount: number;
  importedBy?: { id: string; fullName: string };
};

export type ReconciliationLine = {
  id: string;
  counterpartyCode1C: string;
  amount1C: number;
  amountCRM: number;
  delta: number;
  status: ReceivablesReconcileStatus;
  contactId: string | null;
  clientName: string | null;
  ownerName: string | null;
};

export type WorkClientRow = {
  contactId: string;
  clientName: string;
  externalCode: string | null;
  debtAmount: number;
  overdueAmount: number;
  orderCount: number;
  ownerId: string | null;
  ownerName: string | null;
};

export type WorkOrderRow = {
  id: string;
  orderNumber: string;
  debtAmount: number;
  debtAmountBase: number;
  paidAmount: number;
  totalAmount: number;
  currency: string;
  paymentDueDate: string | null;
  financialStatus: string | null;
  paymentType: string | null;
  clientId: string | null;
  clientName: string | null;
  externalCode: string | null;
  ownerName: string | null;
};

export const receivablesApi = {
  listSnapshots(limit = 20) {
    return apiHttp.get<{ items: ReceivablesSnapshot[] }>(`/receivables/snapshots`, {
      params: { limit },
    });
  },

  uploadSnapshot(formData: FormData) {
    return fetch("/api/receivables/snapshots/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      return { data: (await res.json()) as ReceivablesSnapshot };
    });
  },

  reconciliationSummary(snapshotId: string, ownerId?: string) {
    return apiHttp.get<{
      snapshot: ReceivablesSnapshot;
      currency: string;
      kpi: {
        total1C: number;
        totalCRM: number;
        totalDelta: number;
        deltaCount: number;
        alignedCount: number;
        managerDeltaCount: number;
        isAligned: boolean;
      };
    }>("/receivables/reconciliation/summary", {
      params: { snapshotId, ownerId: ownerId || undefined },
    });
  },

  listReconciliation(params: {
    snapshotId: string;
    page?: number;
    pageSize?: number;
    status?: string;
    deltasOnly?: boolean;
    q?: string;
    ownerId?: string;
  }) {
    return apiHttp.get<{
      currency: string;
      items: ReconciliationLine[];
      total: number;
      page: number;
      pageSize: number;
    }>("/receivables/reconciliation", { params });
  },

  refreshReconciliation(snapshotId: string) {
    return apiHttp.post("/receivables/reconciliation/refresh", { snapshotId });
  },

  workSummary(ownerId?: string) {
    return apiHttp.get<{
      currency: string;
      reconciliation: {
        snapshotId: string;
        snapshotDate: string;
        isAligned: boolean;
        managerDeltaCount: number;
      } | null;
      kpi: {
        debtTotal: number;
        overdueDebt: number;
        clientsWithDebtCount: number;
        ordersWithDebtCount: number;
      };
    }>("/receivables/work/summary", { params: { ownerId: ownerId || undefined } });
  },

  workClients(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    ownerId?: string;
    overdue?: boolean;
  }) {
    return apiHttp.get<{
      currency: string;
      items: WorkClientRow[];
      total: number;
      page: number;
      pageSize: number;
    }>("/receivables/work/clients", { params });
  },

  workOrders(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    ownerId?: string;
    overdue?: boolean;
    contactId?: string;
  }) {
    return apiHttp.get<{
      currency: string;
      items: WorkOrderRow[];
      total: number;
      page: number;
      pageSize: number;
    }>("/receivables/work/orders", { params });
  },
};
