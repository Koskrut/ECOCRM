import type { OutboundAttemptForDial } from "../voice-runtime/voice-runtime.types";

/** Correlation IDs for gateway ↔ CRM (also mirrored on OutboundCallAttempt). */
export type OutboundCallCorrelationIds = {
  externalSessionId?: string;
  providerCallId?: string;
  openaiCallId?: string;
  recordingId?: string;
  transcriptId?: string;
};

/** Callback contract for gateway to POST events back to CRM. */
export type OutboundVoiceCallbackContract = {
  /** Full URL to POST webhooks (e.g. https://api.example.com/integrations/outbound-voice/webhook). */
  webhookUrl: string;
  /** Header name for shared secret (must match CRM IntegrationSetting). */
  webhookSecretHeader: string;
  /** Public URL of CRM backend (for documentation / gateway UI). */
  publicBaseUrl?: string;
};

/** Extended create-call body for HTTP / Kyivstar gateway (backward compatible with legacy keys). */
export type OutboundCreateCallPayload = {
  attemptId: string;
  campaignId: string;
  scenarioCode: string;
  scenarioVersion: string;
  /** Convenience: scenarioCode@scenarioVersion */
  scenarioKey: string;
  phone: string;
  phoneNormalized: string;
  leadId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  /** CRM context pack (legacy alias: context). */
  context: Record<string, unknown>;
  crmContext: Record<string, unknown>;
  callback?: OutboundVoiceCallbackContract;
  voiceConfig?: Record<string, unknown>;
  transferTargets?: unknown[];
  catalogContext?: Record<string, unknown>;
  managerMetadata?: Record<string, unknown>;
};

export function buildScenarioKey(attempt: OutboundAttemptForDial): string {
  return `${attempt.scenarioCode}@${attempt.scenarioVersion}`;
}
