import type { TelephonyCallState } from "./telephony-provider.interface";

/**
 * Maps provider-specific status strings to TelephonyCallState.
 * Real B2B labels vary — extend when your adapter contract is confirmed.
 */
export function mapProviderStatusToTelephony(
  raw: string,
): { status: TelephonyCallState; reason?: string } | null {
  const n = raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["dialing", "dial", "init", "progress", "calling", "setup", "pending", "queued", "starting"].includes(n)) {
    return { status: "dialing" };
  }
  if (["ringing", "ring", "alerting", "early", "proceeding"].includes(n)) {
    return { status: "ringing" };
  }
  if (["answered", "active", "established", "inprogress", "connected", "talking", "bridged"].includes(n)) {
    return { status: "answered" };
  }
  if (["completed", "ended", "hangup", "normalclearing", "bye", "released", "terminated", "disconnected"].includes(n)) {
    return { status: "completed" };
  }
  if (
    [
      "failed",
      "busy",
      "rejected",
      "timeout",
      "cancelled",
      "canceled",
      "error",
      "unavailable",
      "congestion",
      "noanswer",
      "no_answer",
    ].includes(n)
  ) {
    return { status: "failed", reason: raw };
  }
  return null;
}

const STATUS_FIELD_NAMES = new Set([
  "status",
  "state",
  "callState",
  "phase",
  "sipStatus",
  "legStatus",
  "call_status",
  "callStatus",
  "telephonyStatus",
]);

const NEST_FIRST = ["data", "result", "call", "payload", "response", "body", "resource"] as const;

/**
 * Extract a telephony status label from common nested JSON shapes.
 * Does not guess arbitrary string fields — only known key names.
 */
export function extractStatusString(json: unknown, depth = 0): string | null {
  if (depth > 6 || !json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;

  for (const k of Object.keys(o)) {
    if (!STATUS_FIELD_NAMES.has(k)) continue;
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  for (const nk of NEST_FIRST) {
    const inner = o[nk];
    if (inner && typeof inner === "object") {
      const r = extractStatusString(inner, depth + 1);
      if (r) return r;
    }
  }

  return null;
}

export function extractFailureReason(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  if (typeof o.reason === "string" && o.reason.trim()) return o.reason.trim();
  if (typeof o.failureReason === "string" && o.failureReason.trim()) return o.failureReason.trim();
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim();
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim();
  if (o.error && typeof o.error === "object") {
    const e = o.error as Record<string, unknown>;
    if (typeof e.message === "string" && e.message.trim()) return e.message.trim();
  }
  for (const nk of NEST_FIRST) {
    const inner = o[nk];
    if (inner && typeof inner === "object") {
      const r = extractFailureReason(inner);
      if (r) return r;
    }
  }
  return undefined;
}
