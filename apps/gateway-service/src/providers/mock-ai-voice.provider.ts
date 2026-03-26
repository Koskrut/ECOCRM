import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AiAudioChunk, AiSessionHandle, AiVoiceProvider } from "./ai-voice-provider.interface";

/**
 * Simulated AI session — no OpenAI Realtime wire protocol.
 */
@Injectable()
export class MockAiVoiceProvider implements AiVoiceProvider {
  private readonly outputListeners = new Map<string, Set<(audio: AiAudioChunk) => void>>();

  async createSession(input: { externalSessionId: string; attemptId: string }): Promise<AiSessionHandle> {
    void input;
    return { openaiSessionId: `mock-ai-${randomUUID()}` };
  }

  async sendContext(handle: AiSessionHandle, context: Record<string, unknown>): Promise<void> {
    void handle;
    void context;
  }

  async startConversation(handle: AiSessionHandle): Promise<void> {
    void handle;
  }

  async pushAudioInput(handle: AiSessionHandle, audio: AiAudioChunk): Promise<void> {
    const listeners = this.outputListeners.get(handle.openaiSessionId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(audio);
    }
  }

  onAudioOutput(handle: AiSessionHandle, listener: (audio: AiAudioChunk) => void): () => void {
    if (!this.outputListeners.has(handle.openaiSessionId)) {
      this.outputListeners.set(handle.openaiSessionId, new Set());
    }
    const set = this.outputListeners.get(handle.openaiSessionId)!;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  async handleToolInvocation(handle: AiSessionHandle, toolName: string, args: unknown): Promise<unknown> {
    void handle;
    return { toolName, args };
  }

  async closeSession(handle: AiSessionHandle): Promise<void> {
    this.outputListeners.delete(handle.openaiSessionId);
  }
}
