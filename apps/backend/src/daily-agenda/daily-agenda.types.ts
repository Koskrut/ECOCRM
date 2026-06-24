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

export type DailyAgendaItemMetadata = {
  nextActionType?: string;
  actionHref?: string;
  reason?: string;
  suggestionKey?: string;
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
};

export type ScheduledContactAction = {
  contactId: string;
  fullName: string;
  nextActionType: string;
  nextActionAt: string | null;
  nextActionNote: string | null;
  phone: string | null;
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
};

export type SaveAgendaBody = {
  date: string;
  items: AgendaPlanItemInput[];
};
