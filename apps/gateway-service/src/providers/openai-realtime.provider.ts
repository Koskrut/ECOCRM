import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { StructuredLogger } from "../common/structured-logger";
import type { AiAudioChunk, AiSessionHandle, AiVoiceProvider } from "./ai-voice-provider.interface";

type WsLike = {
  send(data: string): void;
  close(): void;
  on(event: "message" | "error" | "close", listener: (...args: unknown[]) => void): void;
};

/**
 * OpenAI Realtime WS integration point.
 * Uses lazy WS wiring; if API key is missing, throws explicit config error.
 */
@Injectable()
export class OpenAiRealtimeVoiceProvider implements AiVoiceProvider {
  private readonly sockets = new Map<string, WsLike>();
  private readonly outputListeners = new Map<string, Set<(audio: AiAudioChunk) => void>>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly log: StructuredLogger,
  ) {}

  async createSession(input: { externalSessionId: string; attemptId: string }): Promise<AiSessionHandle> {
    this.assertConfigured();
    const openaiSessionId = `openai-${randomUUID()}`;
    this.log.log("openai_realtime_session_created", {
      externalSessionId: input.externalSessionId,
      attemptId: input.attemptId,
      openaiSessionId,
    });
    return { openaiSessionId };
  }

  async sendContext(handle: AiSessionHandle, context: Record<string, unknown>): Promise<void> {
    const ws = this.sockets.get(handle.openaiSessionId);
    if (!ws) return;
    ws.send(JSON.stringify({ type: "session.update", context }));
  }

  async startConversation(handle: AiSessionHandle): Promise<void> {
    this.assertConfigured();
    const ws = await this.ensureSocket(handle.openaiSessionId);
    ws.send(
      JSON.stringify({
        type: "session.start",
        model: this.config.openaiRealtimeModel,
        voice: this.config.openaiRealtimeVoice,
      }),
    );
  }

  async pushAudioInput(handle: AiSessionHandle, audio: AiAudioChunk): Promise<void> {
    const ws = this.sockets.get(handle.openaiSessionId);
    if (!ws) return;
    ws.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: audio.pcm16leBase64,
      }),
    );
  }

  onAudioOutput(handle: AiSessionHandle, listener: (audio: AiAudioChunk) => void): () => void {
    if (!this.outputListeners.has(handle.openaiSessionId)) {
      this.outputListeners.set(handle.openaiSessionId, new Set());
    }
    const listeners = this.outputListeners.get(handle.openaiSessionId)!;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  async handleToolInvocation(handle: AiSessionHandle, toolName: string, args: unknown): Promise<unknown> {
    const ws = this.sockets.get(handle.openaiSessionId);
    if (ws) {
      ws.send(JSON.stringify({ type: "tool.output", toolName, args }));
    }
    return { toolName, args, acknowledged: true };
  }

  async closeSession(handle: AiSessionHandle): Promise<void> {
    const ws = this.sockets.get(handle.openaiSessionId);
    if (ws) {
      ws.close();
      this.sockets.delete(handle.openaiSessionId);
    }
    this.outputListeners.delete(handle.openaiSessionId);
  }

  private async ensureSocket(openaiSessionId: string): Promise<WsLike> {
    const existing = this.sockets.get(openaiSessionId);
    if (existing) return existing;

    const { WebSocket } = await import("ws");
    const ws = new WebSocket(this.config.openaiRealtimeWsUrl, {
      headers: {
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
    }) as unknown as WsLike;

    ws.on("message", (payload: unknown) => {
      const data = typeof payload === "string" ? payload : String(payload);
      this.handleWsMessage(openaiSessionId, data);
    });
    ws.on("error", (err: unknown) => {
      this.log.warn("openai_ws_error", { openaiSessionId, reason: String(err) });
    });
    ws.on("close", () => {
      this.sockets.delete(openaiSessionId);
    });

    this.sockets.set(openaiSessionId, ws);
    return ws;
  }

  private handleWsMessage(openaiSessionId: string, raw: string): void {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (parsed?.type !== "response.audio.delta") return;
    const audio = parsed.delta;
    if (typeof audio !== "string") return;
    const listeners = this.outputListeners.get(openaiSessionId);
    if (!listeners) return;
    const chunk: AiAudioChunk = {
      pcm16leBase64: audio,
      sampleRateHz: this.config.openaiRealtimeSampleRateHz,
      channels: 1,
    };
    for (const listener of listeners) listener(chunk);
  }

  private assertConfigured(): void {
    if (!this.config.openaiApiKey) {
      throw new Error("OPENAI_REALTIME_CONFIG_MISSING");
    }
  }
}
