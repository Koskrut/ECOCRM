import { apiFetch } from "@/lib/api";

export type CreateLeadBody = {
  name?: string;
  phone?: string;
  email?: string;
  companyName?: string;
  message?: string;
  source?: string;
};

export type Lead = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  companyName?: string | null;
  status: string;
  createdAt: string;
};

export const leadsApi = {
  create: (token: string, body: CreateLeadBody) =>
    apiFetch<Lead>("/leads", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};

