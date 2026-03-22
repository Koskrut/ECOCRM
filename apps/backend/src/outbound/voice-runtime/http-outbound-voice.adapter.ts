import { Injectable, Logger } from "@nestjs/common";
import { normalizePhoneToE164 } from "../../common/phone.utils";
import { SettingsService } from "../../settings/settings.service";
import type { OutboundAttemptForDial, VoiceInitiateResult, VoiceRuntimeAdapter } from "./voice-runtime.types";

export const VOICE_PROVIDER_HTTP = "HTTP_OUTBOUND_VOICE";

function extractSessionIdFromResponse(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  const rec = obj as Record<string, unknown>;
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

@Injectable()
export class HttpOutboundVoiceAdapter implements VoiceRuntimeAdapter {
  private readonly logger = new Logger(HttpOutboundVoiceAdapter.name);

  constructor(private readonly settings: SettingsService) {}

  async initiateOutboundCall(
    attempt: OutboundAttemptForDial,
    contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult> {
    const secrets = await this.settings.getOutboundVoiceRuntimeSecrets();
    if (!secrets.apiBaseUrl || !secrets.apiToken) {
      throw new Error("HTTP outbound voice: apiBaseUrl and apiToken must be configured");
    }

    const base = secrets.apiBaseUrl.replace(/\/+$/, "");
    const path = secrets.createCallPath.startsWith("/") ? secrets.createCallPath : `/${secrets.createCallPath}`;
    const url = `${base}${path}`;

    const phoneE164 = normalizePhoneToE164(attempt.phoneNormalized) ?? `+${attempt.phoneNormalized}`;

    const body = {
      attemptId: attempt.id,
      phone: phoneE164,
      phoneNormalized: attempt.phoneNormalized,
      scenarioCode: attempt.scenarioCode,
      scenarioVersion: attempt.scenarioVersion,
      context: contextPack,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secrets.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      this.logger.warn(`HTTP outbound voice: non-JSON response ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res.ok) {
      throw new Error(`HTTP outbound voice: ${res.status} ${text.slice(0, 500)}`);
    }

    const sessionId = extractSessionIdFromResponse(json, secrets.responseSessionIdKeys);
    if (!sessionId) {
      throw new Error(
        `HTTP outbound voice: could not read session id from response (tried keys: ${secrets.responseSessionIdKeys.join(", ")})`,
      );
    }

    return {
      provider: VOICE_PROVIDER_HTTP,
      providerSessionId: sessionId,
    };
  }
}
