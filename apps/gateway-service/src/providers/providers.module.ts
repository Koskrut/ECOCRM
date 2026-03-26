import { Module } from "@nestjs/common";
import { MockTelephonyProvider } from "./mock-telephony.provider";
import { MockAiVoiceProvider } from "./mock-ai-voice.provider";
import { KyivstarTelephonyProvider } from "./kyivstar.provider";
import { OpenAiRealtimeVoiceProvider } from "./openai-realtime.provider";
import { ProviderRuntimeResolverService } from "./provider-runtime-resolver.service";

@Module({
  providers: [
    MockTelephonyProvider,
    MockAiVoiceProvider,
    KyivstarTelephonyProvider,
    OpenAiRealtimeVoiceProvider,
    ProviderRuntimeResolverService,
  ],
  exports: [
    MockTelephonyProvider,
    MockAiVoiceProvider,
    KyivstarTelephonyProvider,
    OpenAiRealtimeVoiceProvider,
    ProviderRuntimeResolverService,
  ],
})
export class ProvidersModule {}
