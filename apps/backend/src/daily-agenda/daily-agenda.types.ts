export type DailyAgendaProfile = "office" | "field";

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

export type ScheduledVisit = {
  id: string;
  title: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  contactId: string | null;
  companyName: string | null;
  contactName: string | null;
  purpose: string | null;
};

export type ScheduledTask = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  contactId: string | null;
  leadId: string | null;
  contactName: string | null;
  companyName: string | null;
  leadName: string | null;
  daysOverdue: number | null;
};

export type ScheduledContactAction = {
  contactId: string;
  fullName: string;
  nextActionType: string;
  nextActionAt: string | null;
  nextActionNote: string | null;
  phone: string | null;
  companyName: string | null;
  clientStage: string | null;
};

export type AgendaHotLead = {
  id: string;
  name: string;
  source: string | null;
  daysSinceActivity: number | null;
  status: string;
  companyName: string | null;
};

export type AgendaOverdueOrder = {
  id: string;
  orderNumber: string;
  debtAmount: number;
  currency: string;
  contactName: string | null;
  companyName: string | null;
  daysOverdue: number | null;
};

export type AgendaCallQueueItem = {
  queueItemId: string;
  contactId: string | null;
  leadId: string | null;
  contactName: string | null;
  leadName: string | null;
  phone: string | null;
  companyName: string | null;
};

export type AgendaDebtContact = {
  contactId: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  debtAmount: number;
  priorityScore: number;
};

export type AgendaMissedCall = {
  callId: string;
  contactId: string | null;
  leadId: string | null;
  contactName: string | null;
  phone: string | null;
};

export type AgendaQueueContact = {
  contactId: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  priorityScore: number;
  priorityReasons: string[];
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
  profile: DailyAgendaProfile;
  plan: {
    id: string;
    status: DailyAgendaPlanStatus;
    committedAt: string | null;
    items: AgendaPlanItem[];
  } | null;
  completion: AgendaCompletion | null;
  defaultProposal: AgendaPlanItemInput[] | null;
  scheduled: {
    visits: ScheduledVisit[];
    tasks: ScheduledTask[];
    contactActions: ScheduledContactAction[];
  };
  availableSuggestions: AgendaSuggestion[];
  groupedSuggestions: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>>;
  summary: AgendaSummary;
};

export type SaveAgendaBody = {
  date: string;
  items: AgendaPlanItemInput[];
};
