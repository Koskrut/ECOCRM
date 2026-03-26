import type { AiAudioChunk, AiVoiceProvider } from "../providers/ai-voice-provider.interface";
import type { TelephonyProvider } from "../providers/telephony-provider.interface";

export interface MediaBridgeSession {
  id: string;
  externalSessionId: string;
  providerCallId: string;
  aiSessionId: string;
}

export interface MediaBridge {
  connect(input: {
    externalSessionId: string;
    providerCallId: string;
    aiSessionId: string;
    telephony: TelephonyProvider;
    ai: AiVoiceProvider;
  }): Promise<MediaBridgeSession>;

  pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void>;

  close(sessionId: string): Promise<void>;
}
