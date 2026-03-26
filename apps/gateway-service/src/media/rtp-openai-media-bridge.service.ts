import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { MediaBridge, MediaBridgeSession } from "./media-bridge.interface";
import type { AiAudioChunk, AiVoiceProvider } from "../providers/ai-voice-provider.interface";
import type { TelephonyProvider } from "../providers/telephony-provider.interface";
import { StructuredLogger } from "../common/structured-logger";

/**
 * RTP/OpenAI bridge integration point.
 * This service owns session lifecycle and conversion points; RTP socket plumbing is pending infra specifics.
 */
@Injectable()
export class RtpOpenAiMediaBridgeService implements MediaBridge {
  private readonly sessions = new Map<string, MediaBridgeSession>();

  constructor(private readonly log: StructuredLogger) {}

  async connect(input: {
    externalSessionId: string;
    providerCallId: string;
    aiSessionId: string;
    telephony: TelephonyProvider;
    ai: AiVoiceProvider;
  }): Promise<MediaBridgeSession> {
    void input.telephony;
    void input.ai;
    const session: MediaBridgeSession = {
      id: `rtp-${randomUUID()}`,
      externalSessionId: input.externalSessionId,
      providerCallId: input.providerCallId,
      aiSessionId: input.aiSessionId,
    };
    this.sessions.set(session.id, session);
    this.log.log("media_bridge_connected", {
      externalSessionId: session.externalSessionId,
      mediaSessionId: session.id,
      providerCallId: session.providerCallId,
    });
    return session;
  }

  async pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void> {
    void chunk;
    if (!this.sessions.has(session.id)) return;
    // Integration point: RTP packet -> PCM frame conversion and backpressure handling.
  }

  async close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
