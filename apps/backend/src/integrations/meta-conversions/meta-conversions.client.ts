import { sanitizeMetaError } from "../meta-audiences/meta-audience.normalize";
import type { MetaEvent } from "./meta-conversions.events";

const RAW_USER_KEYS = ["client_ip_address", "client_user_agent", "fbp", "fbc"] as const;

function scrubEventError(message: string, token: string, event: MetaEvent): string {
  let text = sanitizeMetaError(message, token);
  for (const key of RAW_USER_KEYS) {
    const value = event.user_data[key];
    if (value) text = text.split(value).join("[redacted]");
  }
  return text;
}

export type MetaSendConfig = {
  pixelId: string;
  accessToken: string;
  testEventCode: string;
  version: string;
};

export async function postMetaEvent(
  fetchImpl: typeof fetch,
  config: MetaSendConfig,
  event: MetaEvent,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `https://graph.facebook.com/${config.version}/${config.pixelId}/events`;
  const body: Record<string, unknown> = { data: [event] };
  const testCode = config.testEventCode.trim();
  if (testCode) body.test_event_code = testCode;
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { ok: false, error: scrubEventError(text || `Meta HTTP ${response.status}`, config.accessToken, event) };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Помилка мережі";
    return { ok: false, error: scrubEventError(message, config.accessToken, event) };
  }
}
