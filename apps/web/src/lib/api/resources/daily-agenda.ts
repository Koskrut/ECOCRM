import { apiHttp } from "../client";

export type DailyAgendaItemKind =
  | "VISIT"
  | "TASK"
  | "CONTACT_ACTION"
  | "LEAD"
  | "SUGGESTION";

export type DailyAgendaItemStatus = "PLANNED" | "DISMISSED" | "DONE";

export type DailyAgendaPlanStatus = "DRAFT" | "COMMITTED";

export type DailyAgendaCompletionStatus = "green" | "yellow" | "red";

export type AgendaSuggestionCategory =
  | "scheduled"
  | "overdue"
  | "leads"
  | "orders"
  | "queue"
  | "route"
  | "calls"
  | "debt";

export type AgendaEntitySnapshot = {
  contactName?: string;
  companyName?: string;
  phone?: string;
  leadName?: string;
  orderNumber?: string;
  orderId?: string;
  amount?: number;
  currency?: string;
  priorityScore?: number;
  daysOverdue?: number;
  clientStage?: string;
  leadStatus?: string;
};

export type DailyAgendaItemMetadata = {
  nextActionType?: string;
  actionHref?: string;
  reason?: string;
  suggestionKey?: string;
  orderId?: string;
  entitySnapshot?: AgendaEntitySnapshot;
  suggestionCategory?: AgendaSuggestionCategory;
  entityHref?: string;
};

export type AgendaSuggestion = {
  suggestionKey: string;
  kind: DailyAgendaItemKind;
  title: string;
  subtitle: string | null;
  visitId?: string;
  taskId?: string;
  contactId?: string;
  leadId?: string;
  scheduledAt?: string | null;
  metadata?: DailyAgendaItemMetadata;
  reason: string;
};

export type AgendaPlanItemInput = {
  kind: DailyAgendaItemKind;
  status?: DailyAgendaItemStatus;
  position: number;
  visitId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  title: string;
  subtitle?: string | null;
  scheduledAt?: string | null;
  metadata?: DailyAgendaItemMetadata;
};

export type AgendaPlanItem = AgendaPlanItemInput & {
  id: string;
  status: DailyAgendaItemStatus;
  completedAt: string | null;
  completedBy: string | null;
};

export type AgendaCompletion = {
  percent: number;
  status: DailyAgendaCompletionStatus;
  doneCount: number;
  activeCount: number;
  dismissedCount: number;
};

export type AgendaSummary = {
  scheduled: { visits: number; tasks: number; contactActions: number };
  suggestions: Partial<Record<AgendaSuggestionCategory, number>>;
  plan: { total: number; visits: number; calls: number; tasks: number; leads: number; orders: number };
};

export type DailyAgendaPayload = {
  date: string;
  userId: string;
  profile: "office" | "field";
  plan: {
    id: string;
    status: DailyAgendaPlanStatus;
    committedAt: string | null;
    items: AgendaPlanItem[];
  } | null;
  completion: AgendaCompletion | null;
  defaultProposal: AgendaPlanItemInput[] | null;
  scheduled: {
    visits: Array<{
      id: string;
      title: string | null;
      status: string;
      startsAt: string | null;
      contactName: string | null;
      companyName: string | null;
      purpose: string | null;
    }>;
    tasks: Array<{
      id: string;
      title: string;
      dueAt: string | null;
      status: string;
      contactName: string | null;
      companyName: string | null;
      daysOverdue: number | null;
    }>;
    contactActions: Array<{
      contactId: string;
      fullName: string;
      nextActionType: string;
      nextActionAt: string | null;
      companyName: string | null;
      phone: string | null;
    }>;
  };
  availableSuggestions: AgendaSuggestion[];
  groupedSuggestions: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>>;
  summary: AgendaSummary;
};

export const dailyAgendaApi = {
  get: async (params?: { date?: string }): Promise<DailyAgendaPayload> => {
    const qs = params?.date ? `?date=${encodeURIComponent(params.date)}` : "";
    const res = await apiHttp.get<DailyAgendaPayload>(`/work/daily-agenda${qs}`);
    return res.data;
  },

  saveDraft: async (body: { date: string; items: AgendaPlanItemInput[] }): Promise<DailyAgendaPayload> => {
    const res = await apiHttp.post<DailyAgendaPayload>("/work/daily-agenda/draft", body);
    return res.data;
  },

  commit: async (body: { date: string; items: AgendaPlanItemInput[] }): Promise<DailyAgendaPayload> => {
    const res = await apiHttp.post<DailyAgendaPayload>("/work/daily-agenda/commit", body);
    return res.data;
  },

  patchItem: async (
    itemId: string,
    body: { status: DailyAgendaItemStatus },
  ): Promise<DailyAgendaPayload> => {
    const res = await apiHttp.patch<DailyAgendaPayload>(`/work/daily-agenda/items/${itemId}`, body);
    return res.data;
  },
};

export function suggestionToPlanItem(s: AgendaSuggestion, position: number): AgendaPlanItemInput {
  return {
    kind: s.kind,
    position,
    visitId: s.visitId ?? null,
    taskId: s.taskId ?? null,
    contactId: s.contactId ?? null,
    leadId: s.leadId ?? null,
    title: s.title,
    subtitle: s.subtitle,
    scheduledAt: s.scheduledAt ?? null,
    status: "PLANNED",
    metadata: { ...s.metadata, suggestionKey: s.suggestionKey, reason: s.reason },
  };
}

export function itemSourceKey(item: {
  kind: string;
  visitId?: string | null;
  taskId?: string | null;
  contactId?: string | null;
  leadId?: string | null;
  metadata?: { suggestionKey?: string; orderId?: string } | null;
}): string {
  const meta = item.metadata;
  if (meta?.suggestionKey) return meta.suggestionKey;
  if (item.kind === "VISIT" && item.visitId) return `VISIT:${item.visitId}`;
  if (item.kind === "TASK" && item.taskId) return `TASK:${item.taskId}`;
  if (item.kind === "CONTACT_ACTION" && item.contactId) return `CONTACT_ACTION:${item.contactId}`;
  if (item.kind === "LEAD" && item.leadId) return `LEAD:${item.leadId}`;
  if (item.kind === "SUGGESTION" && meta?.orderId) return `overdue-order:${meta.orderId}`;
  if (item.kind === "SUGGESTION" && item.contactId) return `SUGGESTION:contact:${item.contactId}`;
  if (item.kind === "SUGGESTION" && item.leadId) return `SUGGESTION:lead:${item.leadId}`;
  if (item.kind === "SUGGESTION" && item.visitId) return `SUGGESTION:visit:${item.visitId}`;
  if (item.kind === "SUGGESTION" && item.taskId) return `SUGGESTION:task:${item.taskId}`;
  return `${item.kind}:unknown`;
}
