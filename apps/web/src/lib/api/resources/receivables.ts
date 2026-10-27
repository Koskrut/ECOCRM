import { apiHttp } from "../client";

export type ReceivablesReconcileStatus =
  | "ALIGNED"
  | "DELTA_1C_MORE"
  | "DELTA_CRM_MORE"
  | "ONLY_1C"
  | "ONLY_CRM";

/** Virtual reconcile filter: ONLY_CRM lines whose contact has no 1C code (counterpartyCode1C === ""). */
export type ReconcileStatusFilter = ReceivablesReconcileStatus | "NO_CODE";

export const RECEIVABLES_AGING_LABELS = ["0-7", "8-30", "31-60", "61-90", "90+"] as const;
export type ReceivablesAgingLabel = (typeof RECEIVABLES_AGING_LABELS)[number];

export type ReceivablesSnoozeDays = 1 | 3 | 7;

export type WorkClientsSortKey = "debt" | "overdue" | "overdueDays" | "lastPayment" | "lastComment";

export type ReceivablesBatchAction =
  | "assign_owner"
  | "create_call_tasks"
  | "send_telegram"
  | "snooze";

export type SnoozeResponse = {
  ok: boolean;
  contactId: string;
  snoozedUntil: string | null;
  snoozedByName: string | null;
};

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

export type DebtComment = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: string;
  authorName: string | null;
  promiseDate?: string | null;
  promiseAmount?: number | null;
  delayReasonCode?: string | null;
};

export type WorkClientRow = {
  contactId: string;
  clientName: string;
  externalCode: string | null;
  debtAmount: number;
  overdueAmount: number;
  overpaymentAmount?: number;
  orderCount: number;
  ownerId: string | null;
  ownerName: string | null;
  lastPaymentAt?: string | null;
  lastCommentAt: string | null;
  lastCommentPreview: string | null;
  lastCommentAuthorName: string | null;
  phone?: string | null;
  overdueDays?: number;
  /** Bucket by max overdue days among client's orders; null when nothing overdue. */
  agingBucket?: ReceivablesAgingLabel | null;
  primaryOrderId?: string | null;
  promiseDate?: string | null;
  promiseAmount?: number | null;
  /** Server-side: promise date passed and no COMPLETED payment since the promise comment. */
  promiseBroken?: boolean;
  delayReasonCode?: string | null;
  reconcileStatus?: ReceivablesReconcileStatus | null;
  telegramConversationId?: string | null;
  /** YYYY-MM-DD (Kyiv); null when not snoozed or already expired. */
  snoozedUntil?: string | null;
  snoozedByName?: string | null;
};

export type PeriodPaymentRow = {
  id: string;
  amount: number;
  currency: string;
  amountUsd: number | null;
  paidAt: string;
  sourceType: string;
  orderId: string | null;
  orderNumber: string | null;
  clientId: string | null;
  clientName: string | null;
};

export type ContactPaymentRow = {
  id: string;
  amount: number;
  currency: string;
  amountUsd: number | null;
  paidAt: string;
  sourceType: string;
  note: string | null;
  orderId: string | null;
  orderNumber: string | null;
};

export type WorkOrderRow = {
  id: string;
  orderNumber: string;
  debtAmount: number;
  debtAmountBase: number;
  creditAmount?: number;
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
  legacySource?: string | null;
};

export type ContactReceivablesResponse = {
  currency: string;
  externalCode: string | null;
  snoozedUntil?: string | null;
  snoozedByName?: string | null;
  kpi: {
    /** Net position, same formula as the contact card. */
    debtTotal: number;
    grossDebt?: number;
    overdueDebt: number;
    overpaymentTotal?: number;
    clientBalance?: number;
    ordersWithDebtCount: number;
    bitrixLegacyDebt: number;
  };
  reconciliation: {
    snapshotId: string;
    snapshotDate: string;
    counterpartyCode1C: string;
    amount1C: number;
    amountCRM: number;
    delta: number;
    status: ReceivablesReconcileStatus;
  } | null;
  orders: WorkOrderRow[];
  ordersTotal: number;
  payments?: ContactPaymentRow[];
  paymentsTotal?: number;
  paymentsPage?: number;
  paymentsPageSize?: number;
  comments: DebtComment[];
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
        noCodeCount?: number;
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
    status?: ReconcileStatusFilter | string;
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

  /** ADMIN/LEAD only (403 for MANAGER). */
  refreshReconciliation(snapshotId: string) {
    return apiHttp.post("/receivables/reconciliation/refresh", { snapshotId });
  },

  /** ADMIN/LEAD only. Links an ONLY_1C line's code to a contact and re-reconciles the snapshot. */
  linkReconcileLineContact(lineId: string, body: { contactId: string; overwrite?: boolean }) {
    return apiHttp.post<{
      ok: boolean;
      contactId: string;
      externalCode: string;
      previousExternalCode: string | null;
      line: ReconciliationLine | null;
    }>(`/receivables/reconciliation/lines/${lineId}/link-contact`, body);
  },

  workSummary(ownerId?: string) {
    return apiHttp.get<{
      currency: string;
      reconciliation: {
        snapshotId: string;
        snapshotDate: string;
        isAligned: boolean;
        managerDeltaCount: number;
        deltaCount: number;
        total1C: number;
        totalCRM: number;
        totalDelta: number;
      } | null;
      kpi: {
        debtTotal: number;
        overdueDebt: number;
        clientsWithDebtCount: number;
        ordersWithDebtCount: number;
        bitrixLegacyDebt: number;
        bitrixLegacyOrdersCount: number;
        promisedTodayAmount?: number;
        promisedTodayCount?: number;
        collectedTodayAmount?: number;
      };
    }>("/receivables/work/summary", { params: { ownerId: ownerId || undefined } });
  },

  workClients(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    ownerId?: string;
    overdue?: boolean;
    needsComment?: boolean;
    promisedToday?: boolean;
    promiseBroken?: boolean;
    reconcileDeltaOnly?: boolean;
    delayReason?: string;
    aging?: ReceivablesAgingLabel | (string & {});
    snoozed?: "only" | "hide";
    sort?: WorkClientsSortKey;
    dir?: "asc" | "desc";
  }) {
    return apiHttp.get<{
      currency: string;
      items: WorkClientRow[];
      total: number;
      page: number;
      pageSize: number;
      /** Active snoozes among clients matching overdue/aging/q filters. */
      snoozedCount?: number;
    }>("/receivables/work/clients", { params });
  },

  snooze(contactId: string, body: { days: ReceivablesSnoozeDays } | { until: string }) {
    return apiHttp.post<SnoozeResponse>(`/receivables/contacts/${contactId}/snooze`, body);
  },

  unsnooze(contactId: string) {
    return apiHttp.post<SnoozeResponse>(`/receivables/contacts/${contactId}/unsnooze`, {});
  },

  /** Create/reuse a /pay link for the client's full operational debt (UAH). */
  createFullDebtPaymentLink(contactId: string) {
    return apiHttp.post<{
      publicToken: string;
      payPath: string;
      amount: number;
      currency: string;
      orderId: string;
      debtOrderCount: number;
      debtAmountUsd: number;
      reused: boolean;
    }>(`/receivables/contacts/${contactId}/payment-link`, {});
  },

  workAging(ownerId?: string) {
    return apiHttp.get<{
      currency: string;
      buckets: Array<{
        label: ReceivablesAgingLabel | (string & {});
        amount: number;
        clientsCount: number;
        ordersCount: number;
      }>;
    }>("/receivables/work/aging", { params: { ownerId: ownerId || undefined } });
  },

  batch(body: {
    contactIds: string[];
    action: ReceivablesBatchAction;
    ownerId?: string;
    message?: string;
    /** For action "snooze". */
    days?: ReceivablesSnoozeDays;
    until?: string;
  }) {
    return apiHttp.post<{
      ok: boolean;
      action: string;
      processed: number;
      skipped: number;
      errors?: string[];
      ordersReassigned?: number;
      snoozedUntil?: string;
    }>("/receivables/batch", body);
  },

  listDebtComments(contactId: string, limit = 20) {
    return apiHttp.get<{ items: DebtComment[] }>(
      `/receivables/contacts/${contactId}/comments`,
      { params: { limit } },
    );
  },

  addDebtComment(
    contactId: string,
    body: string,
    promise?: {
      promiseDate?: string;
      promiseAmount?: number | null;
      delayReasonCode?: string | null;
    },
  ) {
    return apiHttp.post<DebtComment>(`/receivables/contacts/${contactId}/comments`, {
      body,
      promiseDate: promise?.promiseDate,
      promiseAmount: promise?.promiseAmount,
      delayReasonCode: promise?.delayReasonCode,
    });
  },

  workOrders(params: {
    page?: number;
    pageSize?: number;
    q?: string;
    ownerId?: string;
    overdue?: boolean;
    contactId?: string;
    clientId?: string;
    aging?: ReceivablesAgingLabel | (string & {});
  }) {
    return apiHttp.get<{
      currency: string;
      items: WorkOrderRow[];
      total: number;
      page: number;
      pageSize: number;
    }>("/receivables/work/orders", { params });
  },

  contactReceivables(
    contactId: string,
    params?: { paymentsPage?: number; paymentsPageSize?: number; ordersPage?: number; ordersPageSize?: number },
  ) {
    return apiHttp.get<ContactReceivablesResponse>(`/receivables/contacts/${contactId}`, {
      params,
    });
  },

  periodPayments(params: {
    paidFrom?: string;
    paidTo?: string;
    ownerId?: string;
    page?: number;
    pageSize?: number;
  }) {
    return apiHttp.get<{
      currency: string;
      items: PeriodPaymentRow[];
      total: number;
      page: number;
      pageSize: number;
    }>("/receivables/work/period-payments", { params });
  },
};
