import { apiHttp } from "../client";

export type LeadStatus = "NEW" | "IN_PROGRESS" | "WON" | "NOT_TARGET" | "LOST";
export type LeadSource = "FACEBOOK" | "TELEGRAM" | "INSTAGRAM" | "WEBSITE" | "OTHER";

export type LeadItem = {
  id: string;
  productId: string;
  qty: number;
  price: number;
  lineTotal: number;
  product?: { id: string; name: string; sku: string } | null;
};

export type Lead = {
  id: string;
  companyId: string;
  ownerId: string | null;
  contactId: string | null;
  status: LeadStatus;
  source: LeadSource;
  name: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  message: string | null;
  statusReason: string | null;
  sourceMeta: unknown | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: LeadItem[];
};

export type LeadsResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
};

export type ListLeadsParams = {
  page?: number;
  pageSize?: number;
  status?: LeadStatus;
  source?: LeadSource;
  q?: string;
};

export const leadsApi = {
  list: async (params?: ListLeadsParams): Promise<LeadsResponse> => {
    const res = await apiHttp.get<LeadsResponse>("/leads", { params });
    return res.data;
  },

  get: async (id: string): Promise<Lead> => {
    const res = await apiHttp.get<Lead>(`/leads/${id}`);
    return res.data;
  },

  create: async (payload: {
    companyId: string;
    source?: LeadSource;
    name?: string;
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
      phone?: string | null;
      email?: string | null;
      companyName?: string | null;
      message?: string | null;
      sourceMeta?: unknown;
      items?: Array<{ productId: string; qty: number; price: number }>;
    },
  ): Promise<Lead> => {
    const res = await apiHttp.patch<Lead>(`/leads/${id}`, payload);
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

