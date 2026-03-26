import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { KyivstarTelephonyProvider } from "./kyivstar.provider";
import { MockTelephonyProvider } from "./mock-telephony.provider";
import { OpenAiRealtimeVoiceProvider } from "./openai-realtime.provider";
import { MockAiVoiceProvider } from "./mock-ai-voice.provider";
import type { TelephonyProvider } from "./telephony-provider.interface";
import type { AiVoiceProvider } from "./ai-voice-provider.interface";

@Injectable()
export class ProviderRuntimeResolverService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly mockTelephony: MockTelephonyProvider,
    private readonly kyivstarTelephony: KyivstarTelephonyProvider,
    private readonly mockAi: MockAiVoiceProvider,
    private readonly openai: OpenAiRealtimeVoiceProvider,
  ) {}

  telephonyProvider(): TelephonyProvider {
    return this.config.gatewayProviderMode === "kyivstar_openai"
      ? this.kyivstarTelephony
      : this.mockTelephony;
  }

  aiProvider(): AiVoiceProvider {
    return this.config.gatewayProviderMode === "kyivstar_openai"
      ? this.openai
      : this.mockAi;
  }
}
