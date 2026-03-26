/** Gateway → CRM outbound realtime webhook event types. */
export const OUTBOUND_REALTIME_EVENT_TYPES = [
  "attempt.started",
  "attempt.ringing",
  "attempt.answered",
  "attempt.transcript.partial",
  "attempt.transcript.final",
  "attempt.summary.ready",
  "attempt.classification.ready",
  "attempt.catalog.sent",
  "attempt.transfer.requested",
  "attempt.transferred",
  "attempt.completed",
  "attempt.failed",
] as const;

export type OutboundRealtimeEventType = (typeof OUTBOUND_REALTIME_EVENT_TYPES)[number];

export function isOutboundRealtimeEventType(v: string): v is OutboundRealtimeEventType {
  return (OUTBOUND_REALTIME_EVENT_TYPES as readonly string[]).includes(v);
}

/** Legacy: webhook without eventType is treated as completion. */
export const LEGACY_COMPLETION_EVENT = "attempt.completed";
