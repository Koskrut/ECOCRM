/**
 * Cross-module session flags for GPS flush 401 / forced re-login.
 * AuthProvider polls this; buffer keeps samples until login succeeds.
 * Block state is persisted so headless location-task wakes respect 401/wrong_day/stale_gps.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export type FlushBlockReason = "auth_401" | "wrong_day" | "stale_gps" | null;

const STORAGE_FLUSH_BLOCK = "field_flush_block_reason";
const STORAGE_AUTH_REQUIRED = "field_auth_required";

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

async function persistSessionAuthState(): Promise<void> {
  try {
    if (lastFlushBlockReason) {
      await AsyncStorage.setItem(STORAGE_FLUSH_BLOCK, lastFlushBlockReason);
    } else {
      await AsyncStorage.removeItem(STORAGE_FLUSH_BLOCK);
    }
    if (authRequired) {
      await AsyncStorage.setItem(STORAGE_AUTH_REQUIRED, "1");
    } else {
      await AsyncStorage.removeItem(STORAGE_AUTH_REQUIRED);
    }
  } catch {
    /* best-effort */
  }
}

function persistSessionAuthStateFireAndForget(): void {
  void persistSessionAuthState();
}

/** Rehydrate in-memory flags after process restart (location task / cold start). */
export async function hydrateSessionAuthFromStorage(): Promise<void> {
  try {
    const [block, authFlag] = await Promise.all([
      AsyncStorage.getItem(STORAGE_FLUSH_BLOCK),
      AsyncStorage.getItem(STORAGE_AUTH_REQUIRED),
    ]);
    if (block === "auth_401" || block === "wrong_day" || block === "stale_gps") {
      lastFlushBlockReason = block;
    } else {
      lastFlushBlockReason = null;
    }
    authRequired = authFlag === "1" || lastFlushBlockReason === "auth_401";
    notify();
  } catch {
    /* ignore */
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
  persistSessionAuthStateFireAndForget();
  notify();
}

export function setFlushBlockReason(reason: FlushBlockReason): void {
  lastFlushBlockReason = reason;
  persistSessionAuthStateFireAndForget();
  notify();
}

export function clearStaleGpsFlushBlockIfNeeded(): void {
  if (lastFlushBlockReason === "stale_gps") {
    lastFlushBlockReason = null;
    persistSessionAuthStateFireAndForget();
    notify();
  }
}

export function clearFlushBlockReason(): void {
  lastFlushBlockReason = null;
  persistSessionAuthStateFireAndForget();
  notify();
}

export function subscribeSessionAuth(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Lightweight session refresh probe after flush 401.
 * Backend has no refresh-token endpoint — re-validate via /auth/me.
 * True → keep buffer and retry later; false → force «Увійдіть знову».
 */
export async function validateAuthToken(
  token: string,
  apiBaseUrl: string,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
