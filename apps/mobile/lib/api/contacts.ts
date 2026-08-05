import { apiFetch } from "@/lib/api";
import type {
  CompanyAddress,
  Contact,
  ContactClientStage,
  ContactPhonesResponse,
  ListContactsResponse,
} from "@/types/crm";

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export type ContactPatchBody = Partial<{
  companyId: string | null;
  firstName: string;
  lastName: string;
  middleName: string | null;
  phone: string;
  email: string | null;
  position: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  googlePlaceId: string | null;
  ownerId: string | null;
  externalCode: string | null;
  documentDisplayName: string | null;
  region: string | null;
  addressInfo: string | null;
  city: string | null;
  clientType: string | null;
  status: string | null;
  marketingCallOptOut: boolean;
}>;

export type ContactAddressInput = {
  label?: string | null;
  city?: string | null;
  addressText: string;
  lat?: number | null;
  lng?: number | null;
  googlePlaceId?: string | null;
  isDefault?: boolean;
};

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

  listAddresses: (token: string, id: string) =>
    apiFetch<{ items: CompanyAddress[] }>(`/contacts/${id}/addresses`, {
      token,
    }).then((res) => res.items),

  createAddress: (token: string, id: string, body: ContactAddressInput) =>
    apiFetch<CompanyAddress>(`/contacts/${id}/addresses`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  updateAddress: (
    token: string,
    id: string,
    addressId: string,
    body: Partial<ContactAddressInput>,
  ) =>
    apiFetch<CompanyAddress>(`/contacts/${id}/addresses/${addressId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  deleteAddress: (token: string, id: string, addressId: string) =>
    apiFetch<void>(`/contacts/${id}/addresses/${addressId}`, {
      method: "DELETE",
      token,
    }),

  setDefaultAddress: (token: string, id: string, addressId: string) =>
    apiFetch<CompanyAddress>(`/contacts/${id}/addresses/${addressId}/set-default`, {
      method: "POST",
      token,
    }),

  getPhones: (token: string, id: string) =>
    apiFetch<ContactPhonesResponse>(`/contacts/${id}/phones`, { token }),

  addPhone: (token: string, id: string, body: { phone: string; label?: string | null }) =>
    apiFetch<{ id: string; phone: string; label: string | null }>(`/contacts/${id}/phones`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  deletePhone: (token: string, id: string, phoneId: string) =>
    apiFetch<void>(`/contacts/${id}/phones/${phoneId}`, {
      method: "DELETE",
      token,
    }),

  setPrimaryPhone: (token: string, id: string, phoneId: string) =>
    apiFetch<Contact>(`/contacts/${id}/phones/${phoneId}/set-primary`, {
      method: "POST",
      token,
    }),

  create: (
    token: string,
    body: {
      firstName: string;
      lastName: string;
      phone: string;
      region: string;
      email?: string | null;
      companyId?: string | null;
      address?: string | null;
      city?: string | null;
      lat?: number | null;
      lng?: number | null;
    },
  ) =>
    apiFetch<Contact>("/contacts", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  patch: (token: string, id: string, body: ContactPatchBody) =>
    apiFetch<Contact>(`/contacts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  updateStage: (token: string, id: string, clientStage: ContactClientStage | null) =>
    apiFetch<Contact>(`/contacts/${id}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ clientStage }),
      token,
    }),

  updateNextAction: (
    token: string,
    id: string,
    body: {
      nextActionType?: string | null;
      nextActionAt?: string | null;
      nextActionNote?: string | null;
    },
  ) =>
    apiFetch<Contact>(`/contacts/${id}/next-action`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),
};
