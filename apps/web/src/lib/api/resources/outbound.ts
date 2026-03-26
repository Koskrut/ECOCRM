import { apiHttp } from "../client";

export type OutboundTargetType = "LEAD" | "CONTACT_DORMANT";
export type OutboundAttemptStatus =
  | "PENDING"
  | "QUEUED"
  | "DIALING"
  | "COMPLETED"
  | "FAILED"
  | "NO_ANSWER"
  | "CANCELED";
export type OutboundOutcomeBucket = "SUCCESS" | "NEUTRAL" | "FAILED" | "HANDOFF";

export type OutboundOutcomeAnalysis = {
  analysisSource: "WEBHOOK_ONLY" | "AI_SUPPLEMENT" | "AI_CLASSIFY" | "INTERNAL_STUB";
  needsReview: boolean;
  aiConfidence: number | null;
};

export type OutboundOutcome = {
  outcomeKey: string;
  fields: Record<string, unknown>;
  bucket?: OutboundOutcomeBucket;
  analysis?: OutboundOutcomeAnalysis;
};

export type OutboundCampaignConfig = {
  maxCallsPerDay?: number;
  quietHours?: { start: string; end: string };
  timezone?: string;
  dormantDaysMin?: number;
  defaultAssigneeUserId?: string;
};

export type OutboundCampaign = {
  id: string;
  name: string;
  targetType: OutboundTargetType;
  scenarioCode: string;
  scenarioVersion: string;
  isActive: boolean;
  config: OutboundCampaignConfig | null;
  createdAt: string;
  updatedAt: string;
  _count: { attempts: number };
  statsByStatus: Record<string, number>;
};

export type OutboundAttemptLead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
  status: string;
  source: string;
  message?: string | null;
  owner?: { id: string; fullName: string } | null;
};

export type OutboundAttemptContact = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  status?: string | null;
  owner?: { id: string; fullName: string } | null;
};

export type OutboundAttempt = {
  id: string;
  campaignId: string;
  campaign: { id: string; name: string; targetType: OutboundTargetType };
  targetType: OutboundTargetType;
  leadId: string | null;
  lead: OutboundAttemptLead | null;
  contactId: string | null;
  contact: OutboundAttemptContact | null;
  companyId: string | null;
  phoneNormalized: string;
  scenarioCode: string;
  scenarioVersion: string;
  status: OutboundAttemptStatus;
  provider: string | null;
  /** Runtime adapter id (e.g. HTTP_OUTBOUND_VOICE, KYIVSTAR_OPENAI_GATEWAY). */
  runtimeProvider?: string | null;
  providerSessionId: string | null;
  externalSessionId?: string | null;
  providerCallId?: string | null;
  openaiCallId?: string | null;
  recordingExternalId?: string | null;
  transcriptStatus?: string | null;
  summaryStatus?: string | null;
  classificationStatus?: string | null;
  transferStatus?: string | null;
  catalogSentAt?: string | null;
  lastRuntimeEventAt?: string | null;
  lastRuntimeEventType?: string | null;
  failureCode?: string | null;
  failureReason?: string | null;
  callId: string | null;
  scheduledAt: string | null;
  lastError: string | null;
  summary: string | null;
  transcript?: string | null;
  outcome: OutboundOutcome | null;
  call?: {
    id: string;
    provider: string;
    externalId: string;
    direction: string;
    startedAt: string;
    endedAt: string | null;
    durationSec: number | null;
    status: string;
    recordingUrl: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type ListAttemptsQuery = {
  page?: number;
  pageSize?: number;
  campaignId?: string;
  status?: OutboundAttemptStatus | string;
  scenarioCode?: string;
  needsReview?: boolean;
  callLinked?: boolean;
};

export type ListAttemptsResponse = {
  items: OutboundAttempt[];
  total: number;
  page: number;
  pageSize: number;
};

export type OutboundScenarioOutcomeMapping = {
  outcomeKey: string;
  description: string;
  bucket: OutboundOutcomeBucket;
};

export type OutboundScenario = {
  code: string;
  version: string;
  name: string;
  nameUk: string;
  targetSegment: string;
  outcomeMappings: OutboundScenarioOutcomeMapping[];
};

export type ReviewAttemptBody = {
  markReviewed?: boolean;
  overrideOutcomeKey?: string;
  managerNote?: string;
};

export type CreateCampaignBody = {
  name: string;
  targetType: OutboundTargetType;
  scenarioCode: string;
  scenarioVersion?: string;
  isActive?: boolean;
  config?: {
    maxCallsPerDay?: number;
    quietHours?: { start: string; end: string };
    timezone?: string;
    dormantDaysMin?: number;
    defaultAssigneeUserId?: string;
  };
};

export const outboundApi = {
  listCampaigns: async (): Promise<OutboundCampaign[]> => {
    const res = await apiHttp.get<OutboundCampaign[]>("/outbound/campaigns");
    return res.data;
  },

  setCampaignActive: async (id: string, isActive: boolean): Promise<OutboundCampaign> => {
    const res = await apiHttp.patch<OutboundCampaign>(`/outbound/campaigns/${id}/active`, {
      isActive,
    });
    return res.data;
  },

  listAttempts: async (q: ListAttemptsQuery = {}): Promise<ListAttemptsResponse> => {
    const params: Record<string, string | number | undefined> = {};
    if (q.page) params.page = q.page;
    if (q.pageSize) params.pageSize = q.pageSize;
    if (q.campaignId) params.campaignId = q.campaignId;
    if (q.status) params.status = q.status;
    if (q.scenarioCode) params.scenarioCode = q.scenarioCode;
    if (q.needsReview !== undefined) params.needsReview = String(q.needsReview);
    if (q.callLinked !== undefined) params.callLinked = String(q.callLinked);
    const res = await apiHttp.get<ListAttemptsResponse>("/outbound/attempts", { params });
    return res.data;
  },

  getAttempt: async (id: string): Promise<OutboundAttempt> => {
    const res = await apiHttp.get<OutboundAttempt>(`/outbound/attempts/${id}`);
    return res.data;
  },

  listScenarios: async (): Promise<OutboundScenario[]> => {
    const res = await apiHttp.get<OutboundScenario[]>("/outbound/scenarios");
    return res.data;
  },

  createCampaign: async (body: CreateCampaignBody): Promise<OutboundCampaign> => {
    const res = await apiHttp.post<OutboundCampaign>("/outbound/campaigns", body);
    return res.data;
  },

  reviewAttempt: async (id: string, body: ReviewAttemptBody): Promise<OutboundAttempt> => {
    const res = await apiHttp.patch<OutboundAttempt>(`/outbound/attempts/${id}/review`, body);
    return res.data;
  },
};

export function entityDisplayName(attempt: OutboundAttempt): string {
  if (attempt.lead) {
    const l = attempt.lead;
    return l.fullName?.trim() || [l.firstName, l.lastName].filter(Boolean).join(" ") || "Lead";
  }
  if (attempt.contact) {
    const c = attempt.contact;
    return [c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact";
  }
  return "—";
}

export function formatOutcomeKey(key: string): string {
  return key.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}
