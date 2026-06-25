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
  search: (token: string, q: string, page = 1, pageSize = 20) =>
    apiFetch<ListContactsResponse>(
      `/contacts${qs({ q: q.trim() || undefined, page, pageSize })}`,
      { token },
    ),

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
};
