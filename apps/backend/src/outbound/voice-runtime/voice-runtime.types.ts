import type { OutboundCallAttempt, OutboundCampaign } from "@prisma/client";

export type OutboundAttemptForDial = OutboundCallAttempt & {
  campaign: OutboundCampaign;
};

export interface VoiceInitiateResult {
  provider: string;
  providerSessionId: string;
}

/** Provider-agnostic outbound dialer (Phase 1B). */
export interface VoiceRuntimeAdapter {
  initiateOutboundCall(
    attempt: OutboundAttemptForDial,
    contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult>;
}

export const VOICE_PROVIDER_STUB = "STUB";
