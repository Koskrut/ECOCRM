import { apiGet, apiPost } from "../client";

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
    };

export type QueueItemResponse = {
  id: string;
  status: string;
  sortOrder: number;
  target: QueueItemTarget | null;
  openSessionId: string | null;
  createdAt: string;
};

export type LinkedCall = {
  id: string;
  durationSec: number | null;
  recordingUrl: string | null;
  recordingStatus: string | null;
  status: string;
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
  linkedCall: LinkedCall | null;
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
};

export type PlaybookSection = { id: string; title: string; bullets: string[] };

export const manualCallingApi = {
  getQueue: () => apiGet<{ items: QueueItemResponse[] }>("/manual-calling/queue"),

  getPlaybook: () => apiGet<{ sections: PlaybookSection[] }>("/manual-calling/playbook"),

  enqueue: (body: { leadId?: string; contactId?: string }) =>
    apiPost<{ ok: boolean }>("/manual-calling/queue/items", body),

  claim: (queueItemId: string) =>
    apiPost<{ session: SessionDetail }>(`/manual-calling/queue/items/${queueItemId}/claim`),

  skip: (queueItemId: string) => apiPost<{ ok: boolean }>(`/manual-calling/queue/items/${queueItemId}/skip`),

  startSession: (queueItemId: string) =>
    apiPost<{ session: SessionDetail }>("/manual-calling/sessions", { queueItemId }),

  getSession: (sessionId: string) =>
    apiGet<{ session: SessionDetail }>(`/manual-calling/sessions/${sessionId}`),

  completeSession: (
    sessionId: string,
    body: {
      outcome: ManualCallOutcome;
      note?: string;
      callbackAt?: string;
      idempotencyKey?: string;
    },
  ) =>
    apiPost<{ session: unknown; idempotent?: boolean }>(
      `/manual-calling/sessions/${sessionId}/complete`,
      body,
    ),
};
