import type { GatewayOutboundEvent } from "../contracts/gateway.types";

/**
 * Maps internal event → CRM OutboundVoiceWebhookDto-compatible body.
 * Top-level fields must match CRM whitelist; occurredAt lives in payload.
 */
export function toCrmWebhookBody(ev: GatewayOutboundEvent): Record<string, unknown> {
  const correlationIds = {
    externalSessionId: ev.correlationIds.externalSessionId,
    ...(ev.correlationIds.providerCallId != null && { providerCallId: ev.correlationIds.providerCallId }),
    ...(ev.correlationIds.openaiCallId != null && { openaiCallId: ev.correlationIds.openaiCallId }),
    ...(ev.correlationIds.recordingId != null && { recordingId: ev.correlationIds.recordingId }),
    ...(ev.correlationIds.transcriptId != null && { transcriptId: ev.correlationIds.transcriptId }),
  };

  const payload: Record<string, unknown> = {
    ...ev.payload,
    occurredAt: ev.occurredAt,
  };

  const body: Record<string, unknown> = {
    eventType: ev.eventType,
    deliveryId: ev.deliveryId,
    attemptId: ev.attemptId,
    providerSessionId: ev.providerSessionId,
    correlationIds,
    payload,
  };

  if (ev.outcomeKey !== undefined) body.outcomeKey = ev.outcomeKey;
  if (ev.summary !== undefined) body.summary = ev.summary;
  if (ev.transcript !== undefined) body.transcript = ev.transcript;
  if (ev.fields !== undefined) body.fields = ev.fields;
  if (ev.failureCode !== undefined) body.failureCode = ev.failureCode;
  if (ev.failureReason !== undefined) body.failureReason = ev.failureReason;

  return body;
}
