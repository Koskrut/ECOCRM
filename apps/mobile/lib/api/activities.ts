import { apiFetch } from "@/lib/api";

export type ActivityKind = "NOTE" | "CALL";

export type Activity = {
  id: string;
  kind: ActivityKind;
  body: string;
  createdAt: string;
  createdById?: string | null;
};

export type ListActivitiesResponse = {
  items: Activity[];
  nextCursor?: string | null;
};

export type CreateActivityBody = {
  kind: ActivityKind;
  body: string;
};

export const activitiesApi = {
  listForContact: (
    token: string,
    contactId: string,
    query?: { limit?: number; cursor?: string },
  ) => {
    const qs = new URLSearchParams();
    if (query?.limit) qs.set("limit", String(query.limit));
    if (query?.cursor) qs.set("cursor", query.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return apiFetch<ListActivitiesResponse>(`/contacts/${encodeURIComponent(contactId)}/activities${suffix}`, { token });
  },

  createForContact: (token: string, contactId: string, body: CreateActivityBody) =>
    apiFetch<{ item: Activity }>(`/contacts/${encodeURIComponent(contactId)}/activities`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};

