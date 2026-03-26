import type { OutboundAttemptForDial } from "./voice-runtime/voice-runtime.types";
import type { OutboundCreateCallPayload } from "./contracts/outbound-create-call-payload";
import { buildScenarioKey } from "./contracts/outbound-create-call-payload";
import { OUTBOUND_VOICE_WEBHOOK_PATH } from "./outbound.constants";

export type BuildCallbackArgs = {
  publicBaseUrl: string | null;
};

/**
 * Builds outbound create-call JSON body. Keeps legacy `context` key for generic_http providers.
 */
export function buildOutboundCreateCallPayload(
  attempt: OutboundAttemptForDial,
  contextPack: Record<string, unknown>,
  callback: BuildCallbackArgs,
): OutboundCreateCallPayload {
  const base = callback.publicBaseUrl?.replace(/\/+$/, "") ?? "";
  const webhookUrl =
    base.length > 0 ? `${base}${OUTBOUND_VOICE_WEBHOOK_PATH}` : "";

  const payload: OutboundCreateCallPayload = {
    attemptId: attempt.id,
    campaignId: attempt.campaignId,
    scenarioCode: attempt.scenarioCode,
    scenarioVersion: attempt.scenarioVersion,
    scenarioKey: buildScenarioKey(attempt),
    phone: "",
    phoneNormalized: attempt.phoneNormalized,
    leadId: attempt.leadId,
    contactId: attempt.contactId,
    companyId: attempt.companyId,
    context: contextPack,
    crmContext: contextPack,
  };

  if (webhookUrl) {
    payload.callback = {
      webhookUrl,
      webhookSecretHeader: "x-outbound-voice-secret",
      publicBaseUrl: base || undefined,
    };
  }

  return payload;
}
