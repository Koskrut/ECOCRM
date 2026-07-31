/**
 * Cross-module session flags for GPS flush 401 / forced re-login.
 * AuthProvider polls this; buffer keeps samples until login succeeds.
 */

export type FlushBlockReason = "auth_401" | "wrong_day" | "stale_gps" | null;

let authRequired = false;
let lastFlushBlockReason: FlushBlockReason = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function isAuthRequired(): boolean {
  return authRequired;
}

export function getLastFlushBlockReason(): FlushBlockReason {
  return lastFlushBlockReason;
}

export function setAuthRequired(required: boolean, reason: FlushBlockReason = "auth_401"): void {
  authRequired = required;
  if (required) {
    lastFlushBlockReason = reason;
  } else if (reason === null || lastFlushBlockReason === "auth_401") {
    lastFlushBlockReason = null;
  }
  notify();
}

export function setFlushBlockReason(reason: FlushBlockReason): void {
  lastFlushBlockReason = reason;
  notify();
}

export function clearFlushBlockReason(): void {
  lastFlushBlockReason = null;
  notify();
}

export function subscribeSessionAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Try /auth/me; returns true if token still valid. */
export async function validateAuthToken(
  token: string,
  apiBaseUrl: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
