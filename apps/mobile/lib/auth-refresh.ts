import { getApiBaseUrl } from "./config";
import { getAuthToken, setAuthToken } from "./auth-token";

let refreshInFlight: Promise<string | null> | null = null;

/** Exchange a (possibly expired) JWT for a fresh 12h token. */
export async function refreshAuthToken(current?: string | null): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const token = current ?? (await getAuthToken());
    if (!token) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { token?: string };
      if (typeof body.token !== "string" || !body.token) return null;
      await setAuthToken(body.token);
      return body.token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}
