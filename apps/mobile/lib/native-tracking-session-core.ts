export type NativeSyncFailureReason =
  | "not_android"
  | "flag_disabled"
  | "module_missing"
  | "no_auth_token"
  | "no_api_url"
  | "native_sync_rejected";

export type NativeSyncResult =
  | { ok: true }
  | { ok: false; reason: NativeSyncFailureReason };

/** Transient failures worth a second attempt; permanent config misses are not. */
export function shouldRetryNativeSync(reason: NativeSyncFailureReason): boolean {
  return (
    reason === "no_auth_token" ||
    reason === "no_api_url" ||
    reason === "native_sync_rejected"
  );
}

export async function runNativeSyncWithRetry(
  attempt: () => Promise<NativeSyncResult>,
  opts?: {
    retries?: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<NativeSyncResult> {
  const retries = opts?.retries ?? 1;
  const sleep =
    opts?.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let last: NativeSyncResult = { ok: false, reason: "native_sync_rejected" };
  for (let i = 0; i <= retries; i++) {
    last = await attempt();
    if (last.ok) return last;
    if (!shouldRetryNativeSync(last.reason)) return last;
    if (i < retries) await sleep(250);
  }
  return last;
}
