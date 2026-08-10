import * as SecureStore from "expo-secure-store";

import {
  getAuthTokenWithRetry as getAuthTokenWithRetryCore,
  type GetAuthTokenWithRetryOptions,
} from "./auth-token-retry";

export {
  AUTH_TOKEN_RETRY_ATTEMPTS,
  AUTH_TOKEN_RETRY_DELAYS_MS,
  authTokenRetryDelayMs,
} from "./auth-token-retry";

const TOKEN_KEY = "crm_manager_jwt";

export async function getAuthToken(): Promise<string | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  return token && token.length > 0 ? token : null;
}

export type { GetAuthTokenWithRetryOptions };

/** Retry SecureStore JWT read with short backoff (headless / cold-wake race). */
export async function getAuthTokenWithRetry(
  opts: Omit<GetAuthTokenWithRetryOptions, "getToken"> & {
    getToken?: () => Promise<string | null>;
  } = {},
): Promise<string | null> {
  return getAuthTokenWithRetryCore({
    ...opts,
    getToken: opts.getToken ?? getAuthToken,
  });
}
