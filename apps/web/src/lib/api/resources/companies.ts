import { apiHttp } from "../client";

export type Company = {
  id: string;
  name: string;
  edrpou?: string;
  taxId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CompaniesResponse = {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
};

export const companiesApi = {
  list: async (): Promise<CompaniesResponse> => {
    const res = await apiHttp.get<CompaniesResponse>("/companies");
    return res.data;
  },

  get: async (id: string): Promise<Company> => {
    const res = await apiHttp.get<Company>(`/companies/${id}`);
    return res.data;
  },
};
