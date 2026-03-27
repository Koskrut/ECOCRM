import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";
import { StructuredLogger } from "../common/structured-logger";
import type { AiAudioChunk, AiSessionHandle, AiVoiceProvider } from "./ai-voice-provider.interface";

type WsLike = {
  send(data: string): void;
  close(): void;
  on(event: "message" | "error" | "close" | "open", listener: (...args: unknown[]) => void): void;
};

/**
 * OpenAI Realtime WS integration point.
 * Uses lazy WS wiring; if API key is missing, throws explicit config error.
 */
@Injectable()
export class OpenAiRealtimeVoiceProvider implements AiVoiceProvider {
  private readonly sockets = new Map<string, WsLike>();
  private readonly outputListeners = new Map<string, Set<(audio: AiAudioChunk) => void>>();
  private readonly lifecycleListeners = new Map<
    string,
    Set<(event: { type: "connected" | "disconnected" | "error"; reason?: string }) => void>
  >();
  private readonly artifactListeners = new Map<
    string,
    Set<
      (event: {
        type: "transcript_delta" | "transcript_final" | "summary" | "classification";
        delta?: string;
        transcript?: string;
        summary?: string;
        outcomeKey?: string;
        fields?: Record<string, unknown>;
      }) => void
    >
  >();

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
    if (!ws) throw new Error("OPENAI_WS_NOT_CONNECTED");
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

  onSessionLifecycle(
    handle: AiSessionHandle,
    listener: (event: { type: "connected" | "disconnected" | "error"; reason?: string }) => void,
  ): () => void {
    if (!this.lifecycleListeners.has(handle.openaiSessionId)) {
      this.lifecycleListeners.set(handle.openaiSessionId, new Set());
    }
    const listeners = this.lifecycleListeners.get(handle.openaiSessionId)!;
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  onRuntimeArtifact(
    handle: AiSessionHandle,
    listener: (event: {
      type: "transcript_delta" | "transcript_final" | "summary" | "classification";
      delta?: string;
      transcript?: string;
      summary?: string;
      outcomeKey?: string;
      fields?: Record<string, unknown>;
    }) => void,
  ): () => void {
    if (!this.artifactListeners.has(handle.openaiSessionId)) {
      this.artifactListeners.set(handle.openaiSessionId, new Set());
    }
    const listeners = this.artifactListeners.get(handle.openaiSessionId)!;
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
    this.lifecycleListeners.delete(handle.openaiSessionId);
    this.artifactListeners.delete(handle.openaiSessionId);
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
    ws.on("open", () => {
      this.emitLifecycle(openaiSessionId, { type: "connected" });
    });
    ws.on("error", (err: unknown) => {
      this.log.warn("openai_ws_error", { openaiSessionId, reason: String(err) });
      this.emitLifecycle(openaiSessionId, { type: "error", reason: String(err) });
    });
    ws.on("close", () => {
      this.sockets.delete(openaiSessionId);
      this.emitLifecycle(openaiSessionId, { type: "disconnected", reason: "ws_closed" });
    });

    this.sockets.set(openaiSessionId, ws);
    return ws;
  }

  private emitLifecycle(
    openaiSessionId: string,
    event: { type: "connected" | "disconnected" | "error"; reason?: string },
  ): void {
    const listeners = this.lifecycleListeners.get(openaiSessionId);
    if (!listeners) return;
    for (const listener of listeners) listener(event);
  }

  private handleWsMessage(openaiSessionId: string, raw: string): void {
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    const type = parsed?.type;
    if (type === "response.audio.delta") {
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
      return;
    }
    if (type === "response.audio_transcript.delta") {
      const delta = typeof parsed.delta === "string" ? parsed.delta : "";
      if (delta) this.emitArtifact(openaiSessionId, { type: "transcript_delta", delta });
      return;
    }
    if (type === "response.audio_transcript.done") {
      const transcript =
        typeof parsed.transcript === "string"
          ? parsed.transcript
          : typeof parsed.text === "string"
            ? parsed.text
            : "";
      if (transcript) this.emitArtifact(openaiSessionId, { type: "transcript_final", transcript });
      return;
    }
    if (type === "response.output_text.done") {
      const summary = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (summary) this.emitArtifact(openaiSessionId, { type: "summary", summary });
      return;
    }
    if (type === "response.done") {
      const output = parsed.output;
      if (output && typeof output === "object" && !Array.isArray(output)) {
        const obj = output as Record<string, unknown>;
        const outcomeKey = typeof obj.outcomeKey === "string" ? obj.outcomeKey.trim() : "";
        const fields =
          obj.fields && typeof obj.fields === "object" && !Array.isArray(obj.fields)
            ? (obj.fields as Record<string, unknown>)
            : undefined;
        if (outcomeKey) {
          this.emitArtifact(openaiSessionId, {
            type: "classification",
            outcomeKey,
            fields,
          });
        }
      }
    }
  }

  private emitArtifact(
    openaiSessionId: string,
    event: {
      type: "transcript_delta" | "transcript_final" | "summary" | "classification";
      delta?: string;
      transcript?: string;
      summary?: string;
      outcomeKey?: string;
      fields?: Record<string, unknown>;
    },
  ): void {
    const listeners = this.artifactListeners.get(openaiSessionId);
    if (!listeners) return;
    for (const listener of listeners) listener(event);
  }

  private assertConfigured(): void {
    if (!this.config.openaiApiKey) {
      throw new Error("OPENAI_REALTIME_CONFIG_MISSING");
    }
  }
}
