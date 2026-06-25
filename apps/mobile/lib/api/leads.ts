import { apiFetch } from "@/lib/api";

export type LeadStatus = "NEW" | "IN_PROGRESS" | "WON" | "NOT_TARGET" | "LOST" | "SPAM";
export type LeadSource =
  | "FACEBOOK"
  | "TELEGRAM"
  | "INSTAGRAM"
  | "WEBSITE"
  | "RINGOSTAT"
  | "OTHER"
  | "META";

export type Lead = {
  id: string;
  companyId?: string | null;
  ownerId?: string | null;
  contactId?: string | null;
  status: LeadStatus | string;
  source?: LeadSource | string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  companyName?: string | null;
  message?: string | null;
  comment?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type ListLeadsResponse = {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateLeadBody = {
  name?: string;
  phone?: string;
  email?: string;
  companyName?: string;
  message?: string;
  source?: string;
  companyId?: string;
};

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const leadsApi = {
  list: (
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: string;
      source?: string;
      q?: string;
    } = {},
  ) =>
    apiFetch<ListLeadsResponse>(
      `/leads${qs({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        status: query.status,
        source: query.source,
        q: query.q,
      })}`,
      { token },
    ),

  getById: (token: string, id: string) => apiFetch<Lead>(`/leads/${id}`, { token }),

  create: (token: string, body: CreateLeadBody) =>
    apiFetch<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateStatus: (token: string, id: string, body: { status: string; reason?: string }) =>
    apiFetch<Lead>(`/leads/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  suggestContact: (token: string, id: string) =>
    apiFetch<{ contact: unknown | null }>(`/leads/${id}/suggest-contact`, { token }),

  convert: (
    token: string,
    id: string,
    body: {
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
    },
  ) =>
    apiFetch<{ lead: Lead; contact: unknown }>(`/leads/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  addNote: (token: string, id: string, message: string) =>
    apiFetch<{ ok: boolean }>(`/leads/${id}/note`, {
      method: "POST",
      body: JSON.stringify({ message }),
      token,
    }),
};
