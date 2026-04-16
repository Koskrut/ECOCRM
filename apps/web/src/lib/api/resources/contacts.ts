import { apiHttp } from "../client";

export type ContactNextActionType =
  | "CALL"
  | "MESSAGE"
  | "SEND_OFFER"
  | "CONTROL_PAYMENT"
  | "MEETING"
  | "NO_ACTION";

export type ContactClientStage =
  | "NEW_LEAD"
  | "IN_PROGRESS"
  | "WAITING_DECISION"
  | "ACTIVE_CLIENT"
  | "DORMANT_CLIENT"
  | "AT_RISK"
  | "PROBLEM_DEBT"
  | "LOST_CLIENT";

export const CONTACT_WORK_QUEUE_PRESETS = [
  "attention",
  "overdue",
  "new-no-first-contact",
  "debt-control",
  "return-to-work",
  "risk-or-dormant",
] as const;

export type Contact = {
  id: string;
  companyId?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  position?: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  telegramLinked?: boolean;
  telegramUsername?: string | null;
  telegramLastMessageAt?: string | null;
  telegramConversationId?: string | null;
  hasCallToday?: boolean;
  hasMissedCall?: boolean;
  hasDebt?: boolean;
  debtAmount?: number;
  nextActionType?: ContactNextActionType | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
  clientStage?: ContactClientStage | null;
  /** Статус клієнта (з Bitrix UF_CRM_1755068668186). */
  status?: string | null;
};

export type ContactsResponse = {
  items: Contact[];
  total: number;
  page: number;
  pageSize: number;
};

export type ContactsListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  companyId?: string;
  ownerId?: string;
  hasPhone?: "yes" | "no";
  hasEmail?: "yes" | "no";
  hasCallToday?: "yes" | "no";
  hasMissedCall?: "yes" | "no";
  region?: string;
  city?: string;
  clientType?: string;
  status?: string;
  sortBy?: "createdAt" | "updatedAt" | "name" | "hasCallToday" | "hasMissedCall";
  sortDir?: "asc" | "desc";
};

export type ContactExclusionCode =
  | "DO_NOT_DISTURB"
  | "NON_TARGET_STATUS"
  | "DUPLICATE_MARKED";

export type ContactPriorityReasonCode =
  | "OVERDUE_FOLLOWUP"
  | "NEW_LEAD_NO_FIRST_CONTACT"
  | "NO_CONTACT_14_DAYS"
  | "NO_ORDER_30_DAYS"
  | "HAS_DEBT"
  | "HIGH_VALUE_CLIENT"
  | "RETURN_TO_WORK"
  | "AT_RISK"
  | "DORMANT";

export type ContactWorkQueuePreset = (typeof CONTACT_WORK_QUEUE_PRESETS)[number];

export type ContactWorkQueueFilters = {
  page?: number;
  pageSize?: number;
  ownerId?: string;
  preset?: ContactWorkQueuePreset;
  onlyOverdue?: boolean;
  onlyDebt?: boolean;
  onlyNoContact?: boolean;
  includeExcluded?: boolean;
  q?: string;
};

export type ContactWorkQueueSummaryFilters = {
  ownerId?: string;
  preset?: ContactWorkQueuePreset;
  q?: string;
};

export type ContactPriorityBreakdownEntry = {
  code: ContactPriorityReasonCode;
  weight: number;
  value: number;
  explanation: string;
};

export type ContactInsightsResponse = {
  contactId: string;
  computedAt: string;
  exclusions: {
    excluded: boolean;
    reasons: ContactExclusionCode[];
  };
  metrics: {
    contactId: string;
    daysSinceCreated: number;
    lastContactAt: string | null;
    lastOrderAt: string | null;
    daysSinceLastContact: number | null;
    daysSinceLastOrder: number | null;
    hasOrderHistory: boolean;
    overdueFollowupTasks: number;
    openTasksCount: number;
    debtAmount: number;
    revenue30: number;
    revenue90: number;
    revenue365: number;
    ordersCount30: number;
    ordersCount90: number;
    ordersCount365: number;
    avgCheck90: number;
    avgCheck365: number;
    isNewLeadNoFirstContact: boolean;
    isDormant: boolean;
    isAtRisk: boolean;
  };
  priority: {
    score: number;
    reasons: ContactPriorityReasonCode[];
    breakdown: ContactPriorityBreakdownEntry[];
  };
  suggestion: {
    suggestedStage:
      | "NEW_LEAD"
      | "IN_PROGRESS"
      | "WAITING_DECISION"
      | "ACTIVE_CLIENT"
      | "DORMANT_CLIENT"
      | "AT_RISK"
      | "PROBLEM_DEBT"
      | "LOST_CLIENT"
      | null;
    suggestedNextActionType:
      | "CALL"
      | "MESSAGE"
      | "SEND_OFFER"
      | "CONTROL_PAYMENT"
      | "MEETING"
      | "NO_ACTION";
    explanation: string[];
  };
};

export type ContactWorkQueueItem = {
  contact: {
    id: string;
    fullName: string;
    phone: string | null;
    ownerId: string | null;
    ownerName: string | null;
    companyName: string | null;
    status: string | null;
    clientStage: ContactClientStage | null;
    nextActionType: UpdateContactNextActionPayload["nextActionType"];
    nextActionAt: string | null;
    marketingCallOptOut: boolean;
  };
  priorityScore: number;
  priorityReasons: ContactPriorityReasonCode[];
  scoreBreakdown: ContactPriorityBreakdownEntry[];
  metrics: {
    daysSinceCreated: number;
    daysSinceLastContact: number | null;
    daysSinceLastOrder: number | null;
    overdueFollowupTasks: number;
    debtAmount: number;
    lastContactAt: string | null;
    lastOrderAt: string | null;
  };
  suggestion: {
    suggestedStage: ContactInsightsResponse["suggestion"]["suggestedStage"];
    suggestedNextActionType: ContactInsightsResponse["suggestion"]["suggestedNextActionType"];
  };
};

export type ContactWorkQueueResponse = {
  items: ContactWorkQueueItem[];
  total: number;
  page: number;
  pageSize: number;
  appliedExclusionRules: ContactExclusionCode[];
};

export type ContactWorkQueueSummaryResponse = {
  totalInQueue: number;
  excludedCount: number;
  buckets: {
    overdueFollowup: number;
    newNoFirstContact: number;
    dormantReturn: number;
    atRisk: number;
    debtControl: number;
  };
  presetCounts: Record<ContactWorkQueuePreset, number>;
  topReasons: Array<{
    reason: ContactPriorityReasonCode;
    count: number;
  }>;
  avgPriorityScore: number;
  computedAt: string;
};

export type UpdateContactNextActionPayload = {
  nextActionType: ContactNextActionType | null;
  nextActionAt?: string | null;
  nextActionNote?: string | null;
};

export type UpdateContactStagePayload = {
  clientStage: ContactClientStage | null;
};

export const contactsApi = {
  list: async (params?: ContactsListParams): Promise<ContactsResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    if (params?.companyId) searchParams.set("companyId", params.companyId);
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId);
    if (params?.hasPhone) searchParams.set("hasPhone", params.hasPhone);
    if (params?.hasEmail) searchParams.set("hasEmail", params.hasEmail);
    if (params?.hasCallToday) searchParams.set("hasCallToday", params.hasCallToday);
    if (params?.hasMissedCall) searchParams.set("hasMissedCall", params.hasMissedCall);
    if (params?.region?.trim()) searchParams.set("region", params.region.trim());
    if (params?.city?.trim()) searchParams.set("city", params.city.trim());
    if (params?.clientType?.trim()) searchParams.set("clientType", params.clientType.trim());
    if (params?.status?.trim()) searchParams.set("status", params.status.trim());
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
    if (params?.sortDir) searchParams.set("sortDir", params.sortDir);
    const qs = searchParams.toString();
    const res = await apiHttp.get<ContactsResponse>(`/contacts${qs ? `?${qs}` : ""}`);
    return res.data;
  },

  get: async (id: string): Promise<Contact> => {
    const res = await apiHttp.get<Contact>(`/contacts/${id}`);
    return res.data;
  },

  delete: async (id: string): Promise<{ ok: true }> => {
    const res = await apiHttp.delete<{ ok: true }>(`/contacts/${id}`);
    return res.data;
  },

  getInsights: async (id: string): Promise<ContactInsightsResponse> => {
    const res = await apiHttp.get<ContactInsightsResponse>(`/contacts/${id}/insights`);
    return res.data;
  },

  getWorkQueue: async (params?: ContactWorkQueueFilters): Promise<ContactWorkQueueResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId);
    if (params?.preset) searchParams.set("preset", params.preset);
    if (params?.onlyOverdue != null) searchParams.set("onlyOverdue", String(params.onlyOverdue));
    if (params?.onlyDebt != null) searchParams.set("onlyDebt", String(params.onlyDebt));
    if (params?.onlyNoContact != null) {
      searchParams.set("onlyNoContact", String(params.onlyNoContact));
    }
    if (params?.includeExcluded != null) {
      searchParams.set("includeExcluded", String(params.includeExcluded));
    }
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    const qs = searchParams.toString();
    const res = await apiHttp.get<ContactWorkQueueResponse>(`/contacts/work-queue${qs ? `?${qs}` : ""}`);
    return res.data;
  },

  getWorkQueueSummary: async (
    params?: ContactWorkQueueSummaryFilters,
  ): Promise<ContactWorkQueueSummaryResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.ownerId) searchParams.set("ownerId", params.ownerId);
    if (params?.preset) searchParams.set("preset", params.preset);
    if (params?.q?.trim()) searchParams.set("q", params.q.trim());
    const qs = searchParams.toString();
    const res = await apiHttp.get<ContactWorkQueueSummaryResponse>(
      `/contacts/work-queue/summary${qs ? `?${qs}` : ""}`,
    );
    return res.data;
  },

  updateNextAction: async (
    id: string,
    payload: UpdateContactNextActionPayload,
  ): Promise<Contact> => {
    const res = await apiHttp.patch<Contact>(`/contacts/${id}/next-action`, payload);
    return res.data;
  },

  updateStage: async (
    id: string,
    payload: UpdateContactStagePayload,
  ): Promise<Contact> => {
    const res = await apiHttp.patch<Contact>(`/contacts/${id}/stage`, payload);
    return res.data;
  },
};
