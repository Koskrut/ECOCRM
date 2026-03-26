import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AiSessionHandle, AiVoiceProvider } from "./ai-voice-provider.interface";

/**
 * Simulated AI session — no OpenAI Realtime wire protocol.
 */
@Injectable()
export class MockAiVoiceProvider implements AiVoiceProvider {
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

  async handleToolInvocation(handle: AiSessionHandle, toolName: string, args: unknown): Promise<unknown> {
    void handle;
    return { toolName, args };
  }

  async closeSession(handle: AiSessionHandle): Promise<void> {
    void handle;
  }
}
