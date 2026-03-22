import { Injectable } from "@nestjs/common";
import { SettingsService } from "../../settings/settings.service";
import type { OutboundAttemptForDial, VoiceInitiateResult, VoiceRuntimeAdapter } from "./voice-runtime.types";
import { HttpOutboundVoiceAdapter } from "./http-outbound-voice.adapter";
import { StubVoiceRuntimeAdapter } from "./stub-voice-runtime.adapter";

/**
 * Uses HTTP provider when IntegrationSetting has apiBaseUrl + apiToken; otherwise stub.
 */
@Injectable()
export class SelectingVoiceRuntimeAdapter implements VoiceRuntimeAdapter {
  constructor(
    private readonly settings: SettingsService,
    private readonly httpAdapter: HttpOutboundVoiceAdapter,
    private readonly stubAdapter: StubVoiceRuntimeAdapter,
  ) {}

  async initiateOutboundCall(
    attempt: OutboundAttemptForDial,
    contextPack: Record<string, unknown>,
  ): Promise<VoiceInitiateResult> {
    const s = await this.settings.getOutboundVoiceRuntimeSecrets();
    if (s.apiBaseUrl && s.apiToken) {
      return this.httpAdapter.initiateOutboundCall(attempt, contextPack);
    }
    return this.stubAdapter.initiateOutboundCall(attempt, contextPack);
  }
}
