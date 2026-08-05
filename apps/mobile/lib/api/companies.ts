import { apiFetch } from "@/lib/api";
import type { Company, CompanyAddress, ListCompaniesResponse } from "@/types/crm";

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export type ListCompaniesQuery = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type CreateCompanyBody = {
  name: string;
  phone: string;
  region: string;
  address?: string;
  edrpou?: string;
  taxId?: string;
  lat?: number;
  lng?: number;
};

export const companiesApi = {
  list: (token: string, query: ListCompaniesQuery = {}) =>
    apiFetch<ListCompaniesResponse>(
      `/companies${qs({
        search: query.search?.trim() || undefined,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      })}`,
      { token },
    ),

  getById: (token: string, id: string) => apiFetch<Company>(`/companies/${id}`, { token }),

  getAddresses: (token: string, id: string) =>
    apiFetch<{ items: CompanyAddress[] }>(`/companies/${id}/addresses`, { token }),

  create: (token: string, body: CreateCompanyBody) =>
    apiFetch<Company>("/companies", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};
