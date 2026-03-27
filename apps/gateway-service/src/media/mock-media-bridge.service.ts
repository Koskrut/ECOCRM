import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { MediaBridge, MediaBridgeSession, MediaLifecycleEvent } from "./media-bridge.interface";
import type { AiAudioChunk } from "../providers/ai-voice-provider.interface";

@Injectable()
export class MockMediaBridgeService implements MediaBridge {
  private readonly sessions = new Map<string, MediaBridgeSession>();
  private readonly listeners = new Set<(event: MediaLifecycleEvent) => void>();

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
    this.emit(session, "connected");
    return session;
  }

  async pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void> {
    void session;
    void chunk;
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) this.emit(session, "disconnected");
    this.sessions.delete(sessionId);
  }

  onLifecycleEvent(listener: (event: MediaLifecycleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(session: MediaBridgeSession, type: MediaLifecycleEvent["type"]): void {
    const ev: MediaLifecycleEvent = {
      sessionId: session.id,
      externalSessionId: session.externalSessionId,
      providerCallId: session.providerCallId,
      type,
      occurredAt: new Date().toISOString(),
    };
    for (const listener of this.listeners) listener(ev);
  }
}
