import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { MediaBridge, MediaBridgeSession } from "./media-bridge.interface";
import type { AiAudioChunk } from "../providers/ai-voice-provider.interface";

@Injectable()
export class MockMediaBridgeService implements MediaBridge {
  private readonly sessions = new Map<string, MediaBridgeSession>();

  async connect(input: {
    externalSessionId: string;
    providerCallId: string;
    aiSessionId: string;
  }): Promise<MediaBridgeSession> {
    const session: MediaBridgeSession = {
      id: `media-${randomUUID()}`,
      externalSessionId: input.externalSessionId,
      providerCallId: input.providerCallId,
      aiSessionId: input.aiSessionId,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void> {
    void session;
    void chunk;
  }

  async close(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
