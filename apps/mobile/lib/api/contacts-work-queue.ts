import { apiFetch } from "@/lib/api";

export const CONTACT_WORK_QUEUE_PRESETS = [
  "attention",
  "overdue",
  "new-no-first-contact",
  "debt-control",
  "return-to-work",
  "risk-or-dormant",
] as const;

export type ContactWorkQueuePreset = (typeof CONTACT_WORK_QUEUE_PRESETS)[number];

export type ContactWorkQueueItem = {
  contact: {
    id: string;
    fullName: string;
    phone: string | null;
    ownerId: string | null;
    ownerName: string | null;
    companyName: string | null;
    status: string | null;
    clientStage: string | null;
    nextActionType: string | null;
    nextActionAt: string | null;
  };
  priorityScore: number;
  priorityReasons: string[];
  metrics: {
    daysSinceCreated: number;
    daysSinceLastContact: number | null;
    daysSinceLastOrder: number | null;
    overdueFollowupTasks: number;
    debtAmount: number;
  };
};

export type ContactWorkQueueResponse = {
  items: ContactWorkQueueItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ContactWorkQueueSummaryResponse = {
  totalInQueue: number;
  presetCounts: Partial<Record<ContactWorkQueuePreset, number>>;
};

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export const contactsWorkQueueApi = {
  list: (
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      preset?: ContactWorkQueuePreset;
      q?: string;
    } = {},
  ) =>
    apiFetch<ContactWorkQueueResponse>(
      `/contacts/work-queue${qs({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        preset: query.preset,
        q: query.q,
      })}`,
      { token },
    ),

  summary: (token: string, query: { preset?: ContactWorkQueuePreset } = {}) =>
    apiFetch<ContactWorkQueueSummaryResponse>(
      `/contacts/work-queue/summary${qs({ preset: query.preset })}`,
      { token },
    ),
};
