import type { SessionLifecycleStatus } from "../contracts/gateway.types";

export type TransitionReason =
  | "orchestrator_start"
  | "telephony_ringing"
  | "telephony_answered"
  | "telephony_no_answer"
  | "ai_started"
  | "callback_intent"
  | "transfer_requested"
  | "transferred"
  | "complete"
  | "fail"
  | "cancel";

const ALLOWED: Record<SessionLifecycleStatus, ReadonlySet<SessionLifecycleStatus>> = {
  queued: new Set(["starting", "cancelled"]),
  starting: new Set(["ringing", "failed"]),
  ringing: new Set(["answered", "failed"]),
  answered: new Set(["ai_active", "failed"]),
  ai_active: new Set(["transfer_requested", "completed", "failed"]),
  transfer_requested: new Set(["transferred", "failed", "completed"]),
  transferred: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function canTransition(from: SessionLifecycleStatus, to: SessionLifecycleStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.has(to) ?? false;
}

export function assertTransition(
  from: SessionLifecycleStatus,
  to: SessionLifecycleStatus,
  reason: TransitionReason,
): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid session transition ${from} -> ${to} (reason=${reason}). Allowed: ${[...(ALLOWED[from] ?? [])].join(", ")}`,
    );
  }
}
