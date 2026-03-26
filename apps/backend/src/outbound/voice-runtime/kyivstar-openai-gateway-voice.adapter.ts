import { Injectable, Logger } from "@nestjs/common";
import { normalizePhoneToE164 } from "../../common/phone.utils";
import { SettingsService } from "../../settings/settings.service";
import { buildOutboundCreateCallPayload } from "../outbound-create-call-payload.builder";
import type { OutboundAttemptForDial, VoiceInitiateResult, VoiceRuntimeAdapter } from "./voice-runtime.types";

export const VOICE_PROVIDER_KYIVSTAR_OPENAI_GATEWAY = "KYIVSTAR_OPENAI_GATEWAY";

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
export class KyivstarOpenAiGatewayVoiceAdapter implements VoiceRuntimeAdapter {
  private readonly logger = new Logger(KyivstarOpenAiGatewayVoiceAdapter.name);

  constructor(private readonly settings: SettingsService) {}

  async initiateOutboundCall(
    attempt: OutboundAttemptForDial,
    contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult> {
    const secrets = await this.settings.getOutboundVoiceRuntimeSecrets();
    if (!secrets.apiBaseUrl || !secrets.apiToken) {
      throw new Error("Kyivstar/OpenAI gateway: apiBaseUrl and apiToken must be configured");
    }

    const base = secrets.apiBaseUrl.replace(/\/+$/, "");
    const path = secrets.gatewayCreateCallPath.startsWith("/")
      ? secrets.gatewayCreateCallPath
      : `/${secrets.gatewayCreateCallPath}`;
    const url = `${base}${path}`;

    const phoneE164 = normalizePhoneToE164(attempt.phoneNormalized) ?? `+${attempt.phoneNormalized}`;

    const payload = buildOutboundCreateCallPayload(attempt, contextPack, {
      publicBaseUrl: secrets.publicWebhookBaseUrl,
    });

    const body = {
      ...payload,
      phone: phoneE164,
    };

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), secrets.requestTimeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${secrets.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(t);
    }

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      this.logger.warn(`Kyivstar gateway: non-JSON response ${res.status}: ${text.slice(0, 300)}`);
    }

    if (!res.ok) {
      throw new Error(`Kyivstar/OpenAI gateway: ${res.status} ${text.slice(0, 500)}`);
    }

    const sessionId = extractSessionIdFromResponse(json, secrets.responseSessionIdKeys);
    if (!sessionId) {
      throw new Error(
        `Kyivstar/OpenAI gateway: could not read session id from response (tried keys: ${secrets.responseSessionIdKeys.join(", ")})`,
      );
    }

    return {
      provider: VOICE_PROVIDER_KYIVSTAR_OPENAI_GATEWAY,
      providerSessionId: sessionId,
    };
  }
}
