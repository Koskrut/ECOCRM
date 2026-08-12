import { apiHttp } from "../client";

export type OneCMatchStatus =
  | "MATCHED"
  | "AMBIGUOUS"
  | "UNMATCHED"
  | "ALREADY_IMPORTED"
  | "CONTACT_MISMATCH";

export type OneCMatchedOrder = {
  orderId: string;
  orderNumber: string;
  invoiceNumber: string | null;
  waybillNumber: string | null;
  debtAmount: number;
  currency: string;
  contactId: string | null;
  companyId: string | null;
  contactExternalCode: string | null;
  contactLabel: string | null;
};

export type OneCPreviewRow = {
  rowIndex: number;
  importKey: string;
  paidAt: string;
  documentNumber: string;
  enterpriseCode: string;
  enterpriseName: string;
  amountLv: number;
  amountOv: number | null;
  currency: string;
  purpose: string;
  isNovaPay: boolean;
  managerName: string | null;
  status: OneCMatchStatus;
  matchSource: string | null;
  matchedRef: string | null;
  order: OneCMatchedOrder | null;
  candidateOrders: OneCMatchedOrder[];
  contactByCode: { contactId: string; label: string; externalCode: string } | null;
  warnings: string[];
  amountDebtDelta: number | null;
  overrideOrderId: string | null;
};

export type OneCJobSummary = {
  counts: Record<string, number>;
  rows: OneCPreviewRow[];
};

export type OneCUploadResponse = {
  jobId: string;
  status: string;
  fileName: string | null;
  rowCount: number;
  summary: OneCJobSummary;
};

export type OneCCommitResponse = {
  jobId: string;
  status: string;
  created: number;
  skipped: number;
  errors: Array<{ importKey: string; message: string }>;
  paymentIds: string[];
  rowCount: number;
};

export const oneCPaymentsApi = {
  upload(file: File): Promise<OneCUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    return fetch("/api/one-c-payments/upload", {
      method: "POST",
      body: formData,
      credentials: "include",
    }).then(async (res) => {
      if (!res.ok) {
        let message = `Upload failed (${res.status})`;
        try {
          const body = (await res.json()) as { message?: string | string[] };
          if (body.message) {
            message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
          }
        } catch {
          const text = await res.text();
          if (text) message = text;
        }
        throw new Error(message);
      }
      return (await res.json()) as OneCUploadResponse;
    });
  },

  getJob(jobId: string) {
    return apiHttp.get<OneCUploadResponse & { commitResult?: OneCCommitResponse | null }>(
      `/one-c-payments/jobs/${jobId}`,
    );
  },

  setOverrides(jobId: string, overrides: Record<string, string>) {
    return apiHttp.post<{ jobId: string; status: string; summary: OneCJobSummary }>(
      `/one-c-payments/jobs/${jobId}/overrides`,
      { overrides },
    );
  },

  revalidate(jobId: string) {
    return apiHttp.post<{ jobId: string; status: string; summary: OneCJobSummary }>(
      `/one-c-payments/jobs/${jobId}/revalidate`,
      {},
    );
  },

  commit(jobId: string, overrides?: Record<string, string>) {
    return apiHttp.post<OneCCommitResponse>(`/one-c-payments/jobs/${jobId}/commit`, {
      overrides: overrides ?? {},
    });
  },

  listJobs(limit = 20) {
    return apiHttp.get<{
      items: Array<{
        id: string;
        status: string;
        fileName: string | null;
        createdAt: string;
        rowCount: number;
        commitResult: OneCCommitResponse | null;
      }>;
    }>(`/one-c-payments/jobs`, { params: { limit } });
  },
};
