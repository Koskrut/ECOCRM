import { apiFetch } from "@/lib/api";
import type { ContactShippingProfile, CreateShippingProfileBody } from "@/types/crm";

export type ListShippingProfilesResponse = {
  items: ContactShippingProfile[];
};

export const shippingProfilesApi = {
  list: (token: string, contactId: string) =>
    apiFetch<ListShippingProfilesResponse>(`/contacts/${contactId}/shipping-profiles`, { token }),

  create: (token: string, contactId: string, body: CreateShippingProfileBody) =>
    apiFetch<{ item: ContactShippingProfile }>(`/contacts/${contactId}/shipping-profiles`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (
    token: string,
    contactId: string,
    profileId: string,
    body: Partial<CreateShippingProfileBody>,
  ) =>
    apiFetch<{ item: ContactShippingProfile }>(
      `/contacts/${contactId}/shipping-profiles/${profileId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        token,
      },
    ),

  remove: (token: string, contactId: string, profileId: string) =>
    apiFetch<{ ok: boolean }>(`/contacts/${contactId}/shipping-profiles/${profileId}`, {
      method: "DELETE",
      token,
    }),
};
