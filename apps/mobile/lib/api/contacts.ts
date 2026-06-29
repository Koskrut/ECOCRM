import { apiFetch } from "@/lib/api";
import type { Contact, ContactPhonesResponse, ListContactsResponse } from "@/types/crm";

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const contactsApi = {
  list: (
    token: string,
    query: { q?: string; companyId?: string; page?: number; pageSize?: number } = {},
  ) =>
    apiFetch<ListContactsResponse>(
      `/contacts${qs({
        q: query.q?.trim() || undefined,
        companyId: query.companyId,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
      })}`,
      { token },
    ),

  search: (token: string, q: string, page = 1, pageSize = 20) =>
    contactsApi.list(token, { q, page, pageSize }),

  getById: (token: string, id: string) =>
    apiFetch<Contact>(`/contacts/${id}`, { token }),

  getPhones: (token: string, id: string) =>
    apiFetch<ContactPhonesResponse>(`/contacts/${id}/phones`, { token }),

  create: (
    token: string,
    body: {
      firstName: string;
      lastName: string;
      phone: string;
      email?: string | null;
      companyId?: string | null;
      address?: string | null;
      lat?: number | null;
      lng?: number | null;
    },
  ) =>
    apiFetch<Contact>("/contacts", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  patch: (
    token: string,
    id: string,
    body: Partial<{
      firstName: string;
      lastName: string;
      phone: string;
      email: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
    }>,
  ) =>
    apiFetch<Contact>(`/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),
};
