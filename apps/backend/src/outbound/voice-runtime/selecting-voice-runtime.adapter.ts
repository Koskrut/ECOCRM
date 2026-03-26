import { Injectable } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";
import type { OutboundAttemptForDial, VoiceInitiateResult, VoiceRuntimeAdapter } from "./voice-runtime.types";
import { HttpOutboundVoiceAdapter } from "./http-outbound-voice.adapter";
import { KyivstarOpenAiGatewayVoiceAdapter } from "./kyivstar-openai-gateway-voice.adapter";
import { StubVoiceRuntimeAdapter } from "./stub-voice-runtime.adapter";

/**
 * Uses HTTP provider when IntegrationSetting has apiBaseUrl + apiToken; otherwise stub.
 * When `runtimeMode` is set (stub | generic_http | kyivstar_openai_gateway), it takes precedence over legacy URL heuristics.
 */
@Injectable()
export class SelectingVoiceRuntimeAdapter implements VoiceRuntimeAdapter {
  constructor(
    private readonly settings: SettingsService,
    private readonly httpAdapter: HttpOutboundVoiceAdapter,
    private readonly kyivstarAdapter: KyivstarOpenAiGatewayVoiceAdapter,
    private readonly stubAdapter: StubVoiceRuntimeAdapter,
  ) {}

  async initiateOutboundCall(
    attempt: OutboundAttemptForDial,
    contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult> {
    const s = await this.settings.getOutboundVoiceRuntimeSecrets();

    if (s.runtimeMode === "stub") {
      return this.stubAdapter.initiateOutboundCall(attempt, contextPack);
    }

    if (s.runtimeMode === "kyivstar_openai_gateway") {
      if (s.apiBaseUrl && s.apiToken) {
        return this.kyivstarAdapter.initiateOutboundCall(attempt, contextPack);
      }
      throw new Error("Outbound voice: kyivstar_openai_gateway requires apiBaseUrl and apiToken");
    }

    if (s.runtimeMode === "generic_http") {
      if (s.apiBaseUrl && s.apiToken) {
        return this.httpAdapter.initiateOutboundCall(attempt, contextPack);
      }
      return this.stubAdapter.initiateOutboundCall(attempt, contextPack);
    }

    if (s.apiBaseUrl && s.apiToken) {
      return this.httpAdapter.initiateOutboundCall(attempt, contextPack);
    }
    return this.stubAdapter.initiateOutboundCall(attempt, contextPack);
  }
}
