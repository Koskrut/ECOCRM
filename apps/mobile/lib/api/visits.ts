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
  resultNote: string;
}>;

function normalizeVisitList(res: VisitSummary[] | { items?: VisitSummary[] }): VisitSummary[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export const visitsApi = {
  day: (token: string, dateKey: string, ownerId?: string) =>
    apiFetch<VisitSummary[] | { items: VisitSummary[] }>(
      `/visits/day${qs({ date: dateKey, ownerId })}`,
      { token },
    ).then(normalizeVisitList),

  backlog: (token: string) =>
    apiFetch<VisitSummary[] | { items: VisitSummary[] }>("/visits/backlog", { token }).then(
      normalizeVisitList,
    ),

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

  /** Create visit and optionally schedule on today (status SCHEDULED + startsAt/endsAt). */
  createWithSchedule: async (
    token: string,
    body: CreateVisitBody & {
      scheduleToday?: boolean;
      startsAt?: Date;
      durationMin?: number;
    },
  ) => {
    const { scheduleToday, startsAt, durationMin, ...createBody } = body;
    const visit = await visitsApi.create(token, createBody);
    if (!scheduleToday || !startsAt) return visit;

    const endsAt = new Date(startsAt.getTime() + (durationMin ?? 60) * 60_000);
    return visitsApi.update(token, visit.id, {
      status: "SCHEDULED",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationMin: durationMin ?? 60,
    });
  },

  logAdHoc: (
    token: string,
    body: {
      phone: string;
      firstName: string;
      lastName: string;
      outcome: string;
      resultNote: string;
    } & Record<string, unknown>,
  ) =>
    apiFetch<VisitSummary>("/visits/log-ad-hoc", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};

