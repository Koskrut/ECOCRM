import { apiFetch } from "@/lib/api";
import type { VisitSummary } from "@/types/crm";

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export type ListVisitHistoryResponse = {
  items: VisitSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateVisitBody = {
  contactId?: string | null;
  companyId?: string | null;
  contactAddressId?: string | null;
  companyAddressId?: string | null;
  title?: string | null;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  purpose?: string | null;
};

export type UpdateVisitBody = Partial<{
  status: string;
  startsAt: string;
  endsAt: string;
  title: string | null;
  phone: string | null;
  addressText: string | null;
  lat: number | null;
  lng: number | null;
  purpose: string | null;
  note: string | null;
  durationMin: number | null;
}>;

export const visitsApi = {
  backlog: (token: string) => apiFetch<{ items: VisitSummary[] }>("/visits/backlog", { token }),

  history: (
    token: string,
    query: {
      from?: string;
      to?: string;
      page?: number;
      pageSize?: number;
    },
  ) =>
    apiFetch<ListVisitHistoryResponse>(
      `/visits/history${qs({
        from: query.from,
        to: query.to,
        page: query.page,
        pageSize: query.pageSize,
      })}`,
      { token },
    ),

  create: (token: string, body: CreateVisitBody) =>
    apiFetch<VisitSummary>("/visits", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (token: string, id: string, body: UpdateVisitBody) =>
    apiFetch<VisitSummary>(`/visits/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),
};

