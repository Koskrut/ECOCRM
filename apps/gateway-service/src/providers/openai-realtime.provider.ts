import { Injectable, Logger } from "@nestjs/common";
import type { AiSessionHandle, AiVoiceProvider } from "./ai-voice-provider.interface";

/**
 * OpenAI Realtime voice layer — abstraction for future wiring.
 * Full production phone orchestration needs infra + audio bridge; not implemented here.
 */
@Injectable()
export class OpenAiRealtimeVoiceProvider implements AiVoiceProvider {
  private readonly logger = new Logger(OpenAiRealtimeVoiceProvider.name);

  async createSession(_input: { externalSessionId: string; attemptId: string }): Promise<AiSessionHandle> {
    this.logger.warn("OpenAI Realtime createSession: stub — no WebRTC/realtime session");
    throw new Error("OPENAI_REALTIME_NOT_IMPLEMENTED");
  }

  async sendContext(_handle: AiSessionHandle, _context: Record<string, unknown>): Promise<void> {
    throw new Error("OPENAI_REALTIME_NOT_IMPLEMENTED");
  }

  async startConversation(_handle: AiSessionHandle): Promise<void> {
    throw new Error("OPENAI_REALTIME_NOT_IMPLEMENTED");
  }

  async handleToolInvocation(_handle: AiSessionHandle, _toolName: string, _args: unknown): Promise<unknown> {
    throw new Error("OPENAI_REALTIME_NOT_IMPLEMENTED");
  }

  async closeSession(_handle: AiSessionHandle): Promise<void> {
    throw new Error("OPENAI_REALTIME_NOT_IMPLEMENTED");
  }
}
