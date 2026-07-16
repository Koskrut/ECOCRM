import { apiFetch } from "@/lib/api";

export type ManualCallOutcome =
  | "NO_ANSWER"
  | "BUSY"
  | "WRONG_NUMBER"
  | "GATEKEEPER"
  | "NOT_INTERESTED"
  | "INTERESTED"
  | "REQUESTED_OFFER"
  | "REQUESTED_CALLBACK"
  | "MEETING_SCHEDULED"
  | "CONVERTED";

export type QueueItemTarget =
  | {
      kind: "LEAD";
      id: string;
      displayName: string;
      phone: string | null;
      companyName: string | null;
    }
  | {
      kind: "CONTACT";
      id: string;
      displayName: string;
      phone: string | null;
      companyName: string | null;
    }
  | {
      kind: "COMPANY";
      id: string;
      displayName: string;
      phone: string | null;
      companyName: string | null;
    };

export type QueueItemSource = "MANUAL" | "MISSED_CALL";

export type QueueItemResponse = {
  id: string;
  status: string;
  sortOrder: number;
  source?: QueueItemSource;
  target: QueueItemTarget | null;
  openSessionId: string | null;
  createdAt: string;
};

export type SessionDetail = {
  id: string;
  queueItemId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  outcome: ManualCallOutcome | null;
  note: string | null;
  callbackAt: string | null;
  targetPhoneNormalized: string | null;
  callId: string | null;
  activityId: string | null;
  queueItem: QueueItemResponse;
  lead: {
    id: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    status: string;
    company: { id: string; name: string } | null;
  } | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    company: { id: string; name: string } | null;
  } | null;
  company?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
};

export type PlaybookSection = { id: string; title: string; bullets: string[] };

export const manualCallingApi = {
  getQueue: (token: string) =>
    apiFetch<{ items: QueueItemResponse[] }>("/manual-calling/queue", { token }),

  getPlaybook: (token: string) =>
    apiFetch<{ sections: PlaybookSection[] }>("/manual-calling/playbook", { token }),

  enqueue: (token: string, body: { leadId?: string; contactId?: string; companyId?: string }) =>
    apiFetch<{ ok: boolean }>("/manual-calling/queue/items", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  claim: (token: string, queueItemId: string) =>
    apiFetch<{ session: SessionDetail }>(`/manual-calling/queue/items/${queueItemId}/claim`, {
      method: "POST",
      token,
    }),

  skip: (token: string, queueItemId: string) =>
    apiFetch<{ ok: boolean }>(`/manual-calling/queue/items/${queueItemId}/skip`, {
      method: "POST",
      token,
    }),

  startSession: (token: string, queueItemId: string) =>
    apiFetch<{ session: SessionDetail }>("/manual-calling/sessions", {
      method: "POST",
      body: JSON.stringify({ queueItemId }),
      token,
    }),

  getSession: (token: string, sessionId: string) =>
    apiFetch<{ session: SessionDetail }>(`/manual-calling/sessions/${sessionId}`, { token }),

  completeSession: (
    token: string,
    sessionId: string,
    body: {
      outcome: ManualCallOutcome;
      note?: string;
      callbackAt?: string;
      idempotencyKey?: string;
    },
  ) =>
    apiFetch<{ session: unknown; idempotent?: boolean }>(
      `/manual-calling/sessions/${sessionId}/complete`,
      {
        method: "POST",
        body: JSON.stringify(body),
        token,
      },
    ),
};
