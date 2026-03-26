/** CRM-compatible provider label in create-call response */
export type GatewayProviderLabel = "mock" | "kyivstar_openai";

/** Primary session id — all gateway internals key off this */
export type ExternalSessionId = string;

export type MockOutcome =
  | "no_answer"
  | "price_issue"
  | "competitor"
  | "catalog_requested"
  | "callback_requested"
  | "do_not_call"
  | "transferred"
  | "default";

/** Main lifecycle states */
export type SessionLifecycleStatus =
  | "queued"
  | "starting"
  | "ringing"
  | "answered"
  | "ai_active"
  | "transfer_requested"
  | "transferred"
  | "completed"
  | "failed"
  | "cancelled";

export type SubStatus = "pending" | "ready" | "skipped" | "failed" | "sent" | "requested" | "completed";

export interface SessionSubStatuses {
  transcriptStatus: SubStatus;
  summaryStatus: SubStatus;
  classificationStatus: SubStatus;
  catalogIntentStatus: SubStatus;
  callbackIntentStatus: SubStatus;
  transferStatus: SubStatus;
}

export interface CorrelationIds {
  externalSessionId: string;
  providerCallId: string | null;
  openaiCallId: string | null;
  recordingId: string | null;
  transcriptId: string | null;
}

export interface SessionTimestamps {
  createdAt: string;
  updatedAt: string;
  enteredQueuedAt: string;
  enteredStartingAt?: string;
  enteredRingingAt?: string;
  enteredAnsweredAt?: string;
  enteredAiActiveAt?: string;
  enteredTransferRequestedAt?: string;
  enteredTransferredAt?: string;
  enteredCompletedAt?: string;
  enteredFailedAt?: string;
}

export interface FinalOutcomePayload {
  outcomeKey: string;
  mockOutcome: MockOutcome;
  notes?: string;
}

export interface SessionEntity {
  externalSessionId: ExternalSessionId;
  attemptId: string;
  campaignId: string;
  scenarioCode: string;
  scenarioVersion: string;
  scenarioKey: string;
  phone: string;
  phoneNormalized: string | null;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  /** Resolved mock outcome */
  mockOutcome: MockOutcome;
  lifecycleStatus: SessionLifecycleStatus;
  subStatuses: SessionSubStatuses;
  correlationIds: CorrelationIds;
  /** Gateway-side optional provider runtime id */
  providerSessionId: string | null;
  providerLabel: GatewayProviderLabel;
  webhookUrl: string | null;
  webhookSecretHeader: string;
  context: Record<string, unknown>;
  timestamps: SessionTimestamps;
  finalTranscript?: string;
  finalSummary?: string;
  finalClassification?: ClassificationPayload;
  finalOutcome?: FinalOutcomePayload;
}

export interface ClassificationPayload {
  outcomeKey: string;
  fields: Record<string, unknown>;
}

export interface SummaryPayload {
  summary: string;
}

export interface CatalogIntentPayload {
  requested: boolean;
  skuOrCategory?: string;
}

export interface CallbackIntentPayload {
  requested: boolean;
  preferredWindow?: string;
}

export interface TransferPayload {
  requested: boolean;
  reason?: string;
  queueOrExtension?: string;
}

/** Internal unified event before CRM mapper */
export interface GatewayOutboundEvent {
  eventType: string;
  deliveryId: string;
  attemptId: string;
  providerSessionId: string | null;
  externalSessionId: string;
  correlationIds: CorrelationIds;
  occurredAt: string;
  payload: Record<string, unknown>;
  /** Optional top-level CRM fields */
  outcomeKey?: string;
  summary?: string;
  transcript?: string;
  fields?: Record<string, unknown>;
  failureCode?: string;
  failureReason?: string;
}

export interface SessionEventRecord {
  id: string;
  externalSessionId: string;
  eventType: string;
  deliveryId: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export type DeliveryHttpStatus = "pending" | "success" | "failed";

export interface DeliveryRecord {
  deliveryId: string;
  attemptId: string;
  externalSessionId: string;
  eventType: string;
  tryCount: number;
  lastStatus: DeliveryHttpStatus;
  lastError: string | null;
  lastHttpStatus: number | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}
