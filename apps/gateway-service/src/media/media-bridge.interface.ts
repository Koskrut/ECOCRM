import type { AiAudioChunk, AiVoiceProvider } from "../providers/ai-voice-provider.interface";
import type { TelephonyProvider } from "../providers/telephony-provider.interface";

export type MediaLifecycleEventType =
  | "connected"
  | "disconnected"
  | "reconnecting"
  | "reconnected"
  | "error";

export type MediaLifecycleEvent = {
  sessionId: string;
  externalSessionId: string;
  providerCallId: string;
  type: MediaLifecycleEventType;
  reason?: string;
  occurredAt: string;
};

export interface MediaBridgeSession {
  id: string;
  externalSessionId: string;
  providerCallId: string;
  aiSessionId: string;
  rtpLocalPort?: number;
  rtpRemoteAddress?: string;
  rtpRemotePort?: number;
}

export interface MediaBridge {
  connect(input: {
    externalSessionId: string;
    providerCallId: string;
    aiSessionId: string;
    telephony: TelephonyProvider;
    ai: AiVoiceProvider;
    rtp?: {
      codec?: "mulaw" | "alaw";
      localPort?: number;
      remoteAddress?: string;
      remotePort?: number;
    };
  }): Promise<MediaBridgeSession>;

  pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void>;

  close(sessionId: string): Promise<void>;

  onLifecycleEvent(listener: (event: MediaLifecycleEvent) => void): () => void;
}
