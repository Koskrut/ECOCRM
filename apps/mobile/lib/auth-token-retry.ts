/** Default: 3 attempts with 200ms then 400ms between reads (SecureStore cold-wake race). */
export const AUTH_TOKEN_RETRY_ATTEMPTS = 3;
export const AUTH_TOKEN_RETRY_DELAYS_MS = [200, 400] as const;

export type GetAuthTokenWithRetryOptions = {
  attempts?: number;
  delaysMs?: readonly number[];
  getToken: () => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
};

/** Delay before retry `attemptIndex` (0-based after a null read). null = no more retries. */
export function authTokenRetryDelayMs(
  attemptIndex: number,
  delaysMs: readonly number[] = AUTH_TOKEN_RETRY_DELAYS_MS,
  maxAttempts: number = AUTH_TOKEN_RETRY_ATTEMPTS,
): number | null {
  if (attemptIndex < 0 || attemptIndex >= maxAttempts - 1) return null;
  if (delaysMs.length === 0) return null;
  return delaysMs[Math.min(attemptIndex, delaysMs.length - 1)]!;
}

/**
 * SecureStore can briefly return null on headless / cold-wake while the user is still logged in.
 * Retry a few times with short backoff before flush gives up with "no auth token".
 */
export async function getAuthTokenWithRetry(
  opts: GetAuthTokenWithRetryOptions,
): Promise<string | null> {
  const attempts = opts.attempts ?? AUTH_TOKEN_RETRY_ATTEMPTS;
  const delaysMs = opts.delaysMs ?? AUTH_TOKEN_RETRY_DELAYS_MS;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let i = 0; i < attempts; i++) {
    const token = await opts.getToken();
    if (token) return token;
    const delay = authTokenRetryDelayMs(i, delaysMs, attempts);
    if (delay == null) break;
    await sleep(delay);
  }
  return null;
}
