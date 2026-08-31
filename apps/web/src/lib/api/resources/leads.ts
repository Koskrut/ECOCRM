import { apiHttp } from "../client";

export type LeadStatus = "NEW" | "IN_PROGRESS" | "WON" | "NOT_TARGET" | "LOST" | "SPAM";
export type LeadSource =
  | "FACEBOOK"
  | "TELEGRAM"
  | "INSTAGRAM"
  | "WEBSITE"
  | "RINGOSTAT"
  | "KYIVSTAR"
  | "OTHER"
  | "META";
export type LeadChannel = "FB_LEAD_ADS" | "IG_LEAD_ADS" | "FB_DM" | "IG_DM";

export type LeadItem = {
  id: string;
  productId: string;
  qty: number;
  price: number;
  lineTotal: number;
  product?: { id: string; name: string; sku: string } | null;
};

export type LeadAttribution = {
  id: string;
  metaLeadId: string;
  formId: string;
  pageId: string | null;
  igAccountId: string | null;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  adName: string;
  createdTime: string;
  raw: unknown | null;
};

export type LeadAnswer = { id: string; key: string; value: string; createdAt: string };
export type LeadEvent = { id: string; type: string; message: string; payload: unknown | null; createdAt: string };
export type LeadIdentity = { id: string; type: string; value: string; isPrimary: boolean };

/** First conversion order linked from CRM convert flow (Lead.convertedOrderId). */
export type LeadConvertedOrderRef = { id: string; orderNumber: string };

export type Lead = {
  id: string;
  companyId: string;
  ownerId: string | null;
  owner?: { id: string; fullName: string } | null;
  contactId: string | null;
  /** Canonical link to first conversion order; null if no order was created via convert (or legacy). */
  convertedOrderId?: string | null;
  convertedOrder?: LeadConvertedOrderRef | null;
  status: LeadStatus;
  source: LeadSource;
  channel?: LeadChannel | null;
  name: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  fullName?: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  region?: string | null;
  city?: string | null;
  npCityRef?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  message: string | null;
  comment?: string | null;
  statusReason: string | null;
  sourceMeta: unknown | null;
  score?: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: LeadItem[];
  attribution?: LeadAttribution | null;
  answers?: LeadAnswer[];
  events?: LeadEvent[];
  identities?: LeadIdentity[];
  hasCallToday?: boolean;
  hasMissedCall?: boolean;
};

export type LeadsResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
};

export type LeadAttentionPreset = "without-touch" | "never-contacted-new" | "stale-in-progress";

export type ListLeadsParams = {
  page?: number;
  pageSize?: number;
  status?: LeadStatus | "all";
  source?: LeadSource;
  channel?: LeadChannel;
  ownerId?: string;
  dateFrom?: string;
  dateTo?: string;
  q?: string;
  sortBy?: "createdAt" | "score";
  sortOrder?: "asc" | "desc";
  attention?: LeadAttentionPreset;
  attentionPeriod?: "week" | "month";
  ids?: string;
};

export type MetaSyncFormResult = {
  ok: true;
  formId: string;
  pagesFetched: number;
  leadsFetched: number;
  persistedCreated: number;
  persistedDeduped: number;
  dryRun: boolean;
  errors: Array<{ page: number; status: number; url: string }>;
};

export const leadsApi = {
  /**
   * Admin only. Bulk-fetch leads for a Meta Lead Ads form via Graph API (long-running).
   */
  metaSyncForm: async (payload: {
    formId: string;
    since?: string;
    until?: string;
    pageSize?: number;
    maxPages?: number;
    dryRun?: boolean;
  }): Promise<MetaSyncFormResult> => {
    const res = await apiHttp.post<MetaSyncFormResult>("/leads/meta/sync-form", payload, {
      timeout: 600_000,
    });
    return res.data;
  },

  list: async (params?: ListLeadsParams): Promise<LeadsResponse> => {
    const res = await apiHttp.get<LeadsResponse>("/leads", { params });
    return res.data;
  },

  get: async (id: string): Promise<Lead> => {
    const res = await apiHttp.get<Lead>(`/leads/${id}`);
    return res.data;
  },

  delete: async (id: string): Promise<{ ok: boolean }> => {
    const res = await apiHttp.delete<{ ok: boolean }>(`/leads/${id}`);
    return res.data;
  },

  create: async (payload: {
    companyId?: string;
    source?: LeadSource;
    name?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    fullName?: string;
    phone?: string;
    email?: string;
    companyName?: string;
    message?: string;
    sourceMeta?: unknown;
    items?: Array<{ productId: string; qty: number; price: number }>;
  }): Promise<Lead> => {
    const res = await apiHttp.post<Lead>("/leads", payload);
    return res.data;
  },

  update: async (
    id: string,
    payload: {
      name?: string | null;
      firstName?: string | null;
      lastName?: string | null;
      fullName?: string | null;
      phone?: string | null;
      email?: string | null;
      companyName?: string | null;
      city?: string | null;
      message?: string | null;
      comment?: string | null;
      channel?: LeadChannel | null;
      ownerId?: string | null;
      sourceMeta?: unknown;
      items?: Array<{ productId: string; qty: number; price: number }>;
    },
  ): Promise<Lead> => {
    const res = await apiHttp.patch<Lead>(`/leads/${id}`, payload);
    return res.data;
  },

  addNote: async (id: string, payload: { message: string }): Promise<{ ok: boolean }> => {
    const res = await apiHttp.post<{ ok: boolean }>(`/leads/${id}/note`, payload);
    return res.data;
  },

  updateStatus: async (
    id: string,
    payload: { status: LeadStatus; reason?: string },
  ): Promise<Lead> => {
    const res = await apiHttp.patch<Lead>(`/leads/${id}/status`, payload);
    return res.data;
  },

  convert: async (
    id: string,
    payload: {
      contactMode: "link" | "create";
      contactId?: string;
      contact?: {
        firstName?: string;
        lastName?: string;
        phone?: string;
        email?: string;
        companyName?: string;
      };
      createDeal?: boolean;
      deal?: {
        title?: string;
        amount?: number;
        comment?: string;
      };
    },
  ): Promise<{ lead: Lead; contact: unknown; deal?: unknown }> => {
    const res = await apiHttp.post<{ lead: Lead; contact: unknown; deal?: unknown }>(
      `/leads/${id}/convert`,
      payload,
    );
    return res.data;
  },
};

