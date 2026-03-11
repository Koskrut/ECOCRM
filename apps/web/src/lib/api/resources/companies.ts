import { apiHttp } from "../client";

export type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  ownerId?: string | null;
  owner?: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CompaniesResponse = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

export type CompaniesListParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export const companiesApi = {
  list: async (params?: CompaniesListParams): Promise<CompaniesResponse> => {
    const searchParams = new URLSearchParams();
    if (params?.search?.trim()) searchParams.set("search", params.search.trim());
    if (params?.page != null) searchParams.set("page", String(params.page));
    if (params?.pageSize != null) searchParams.set("pageSize", String(params.pageSize));
    const qs = searchParams.toString();
    const res = await apiHttp.get<CompaniesResponse>(`/companies${qs ? `?${qs}` : ""}`);
    return res.data;
  },

  get: async (id: string): Promise<Company> => {
    const res = await apiHttp.get<Company>(`/companies/${id}`);
    return res.data;
  },

  getChangeHistory: async (id: string): Promise<CompanyChangeHistoryItem[]> => {
    const res = await apiHttp.get<CompanyChangeHistoryItem[]>(`/companies/${id}/change-history`);
    return res.data;
  },
};

export type CompanyChangeHistoryItem = {
  id: string;
  companyId: string;
  changedBy: string | null;
  action: string;
  payload: { field: string; oldValue: string | null; newValue: string | null }[];
  createdAt: string;
};
