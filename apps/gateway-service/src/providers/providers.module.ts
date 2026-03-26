import { Module } from "@nestjs/common";
import { MockTelephonyProvider } from "./mock-telephony.provider";
import { MockAiVoiceProvider } from "./mock-ai-voice.provider";
import { KyivstarTelephonyProvider } from "./kyivstar.provider";
import { OpenAiRealtimeVoiceProvider } from "./openai-realtime.provider";

@Module({
  providers: [MockTelephonyProvider, MockAiVoiceProvider, KyivstarTelephonyProvider, OpenAiRealtimeVoiceProvider],
  exports: [MockTelephonyProvider, MockAiVoiceProvider, KyivstarTelephonyProvider, OpenAiRealtimeVoiceProvider],
})
export class ProvidersModule {}
