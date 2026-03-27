import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import dgram from "dgram";
import type {
  MediaBridge,
  MediaBridgeSession,
  MediaLifecycleEvent,
  MediaLifecycleEventType,
} from "./media-bridge.interface";
import type { AiAudioChunk, AiSessionHandle, AiVoiceProvider } from "../providers/ai-voice-provider.interface";
import type { TelephonyProvider } from "../providers/telephony-provider.interface";
import { StructuredLogger } from "../common/structured-logger";
import { AdaptiveJitterBuffer } from "./jitter-buffer";
import { buildRtpPacket, parseRtpPacket, payloadTypeForCodec, type RtpCodec } from "./rtp/packet";
import { decodeAlaw8k, decodeMulaw8k, encodeAlaw8k, encodeMulaw8k } from "./codecs/g711";
import { pcm16FromBase64, pcm16ToBase64, resample16kTo8k, resample8kTo16k } from "./codecs/resample";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";

/**
 * Real RTP/OpenAI media bridge:
 * - RTP in (PCMU/PCMA 8k) -> PCM16@16k -> OpenAI input
 * - OpenAI output PCM16@16k -> PCMU/PCMA 8k RTP out
 * - jitter buffering, bounded queues, reconnect lifecycle and periodic metrics
 */
@Injectable()
export class RtpOpenAiMediaBridgeService implements MediaBridge {
  private readonly sessions = new Map<string, SessionRuntime>();
  private readonly listeners = new Set<(event: MediaLifecycleEvent) => void>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly log: StructuredLogger,
  ) {}

  async connect(input: {
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
  }): Promise<MediaBridgeSession> {
    void input.telephony;
    const codec = input.rtp?.codec ?? "mulaw";
    const socket = dgram.createSocket("udp4");
    const session: MediaBridgeSession = {
      id: `rtp-${randomUUID()}`,
      externalSessionId: input.externalSessionId,
      providerCallId: input.providerCallId,
      aiSessionId: input.aiSessionId,
      rtpRemoteAddress: input.rtp?.remoteAddress,
      rtpRemotePort: input.rtp?.remotePort,
    };

    await bindSocket(socket, input.rtp?.localPort);
    const addr = socket.address();
    const localPort = typeof addr === "string" ? 0 : addr.port;
    session.rtpLocalPort = localPort;

    const runtime: SessionRuntime = {
      session,
      ai: input.ai,
      aiHandle: { openaiSessionId: input.aiSessionId },
      codec,
      socket,
      jitter: new AdaptiveJitterBuffer({ targetMs: 60, minMs: 50, maxMs: 100 }),
      startedAtMs: Date.now(),
      lastInboundSpeechAtMs: 0,
      aiToRtpQueue: [],
      stats: {
        packetIn: 0,
        packetOut: 0,
        packetLossEstimate: 0,
        rtpInToAiMs: 0,
        aiToRtpOutMs: 0,
        reconnectCount: 0,
      },
      rtpOut: {
        sequence: Math.floor(Math.random() * 65535),
        timestamp: Math.floor(Math.random() * 0xffffffff),
        ssrc: Math.floor(Math.random() * 0xffffffff),
      },
      closed: false,
      reconnecting: false,
    };
    this.sessions.set(session.id, runtime);
    this.setupSocket(runtime);
    this.setupAiOutput(runtime);
    this.setupTimers(runtime);
    this.log.log("media_bridge_connected", {
      externalSessionId: session.externalSessionId,
      mediaSessionId: session.id,
      providerCallId: session.providerCallId,
      codec,
      rtpLocalPort: localPort,
    });
    this.emitLifecycle(runtime, "connected");
    return session;
  }

  async pumpInboundAudio(session: MediaBridgeSession, chunk: AiAudioChunk): Promise<void> {
    const runtime = this.sessions.get(session.id);
    if (!runtime || runtime.closed) return;
    this.enqueueAiOutput(runtime, chunk, Date.now());
  }

  async close(sessionId: string): Promise<void> {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) return;
    await this.closeRuntime(runtime, "manual_close");
    this.sessions.delete(sessionId);
  }

  onLifecycleEvent(listener: (event: MediaLifecycleEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setupSocket(runtime: SessionRuntime): void {
    runtime.socket.on("error", (e) => {
      this.emitLifecycle(runtime, "error", String(e));
    });
    runtime.socket.on("message", (msg) => {
      this.onRtpInbound(runtime, msg);
    });
  }

  private setupAiOutput(runtime: SessionRuntime): void {
    runtime.unsubAiAudio = runtime.ai.onAudioOutput(runtime.aiHandle, (chunk) => {
      this.enqueueAiOutput(runtime, chunk, Date.now());
    });
    const maybeLifecycle = runtime.ai as unknown as {
      onSessionLifecycle?: (
        handle: AiSessionHandle,
        listener: (event: { type: string; reason?: string }) => void,
      ) => () => void;
      startConversation: (handle: AiSessionHandle) => Promise<void>;
    };
    if (maybeLifecycle.onSessionLifecycle) {
      runtime.unsubAiLifecycle = maybeLifecycle.onSessionLifecycle(runtime.aiHandle, (ev) => {
        if (ev.type === "connected") this.emitLifecycle(runtime, "connected");
        if (ev.type === "disconnected") {
          this.emitLifecycle(runtime, "disconnected", ev.reason);
          void this.reconnectAi(runtime, ev.reason ?? "ai_disconnected");
        }
        if (ev.type === "error") {
          this.emitLifecycle(runtime, "error", ev.reason);
          void this.reconnectAi(runtime, ev.reason ?? "ai_error");
        }
      });
    }
  }

  private setupTimers(runtime: SessionRuntime): void {
    runtime.jitterTimer = setInterval(() => {
      this.flushJitterToAi(runtime).catch((e) => {
        this.emitLifecycle(runtime, "error", String(e));
      });
    }, FRAME_MS);

    runtime.rtpOutTimer = setInterval(() => {
      this.flushAiToRtp(runtime);
    }, FRAME_MS);

    runtime.metricsTimer = setInterval(() => {
      this.log.debug("media_bridge_metrics", {
        externalSessionId: runtime.session.externalSessionId,
        mediaSessionId: runtime.session.id,
        rtp_in_to_ai_ms: runtime.stats.rtpInToAiMs,
        ai_to_rtp_out_ms: runtime.stats.aiToRtpOutMs,
        queue_depth: runtime.aiToRtpQueue.length,
        packet_loss_estimate: runtime.stats.packetLossEstimate,
        reconnect_count: runtime.stats.reconnectCount,
        session_duration_ms: Date.now() - runtime.startedAtMs,
      });
    }, METRICS_INTERVAL_MS);

    runtime.timeoutTimer = setInterval(() => {
      if (Date.now() - runtime.startedAtMs > this.config.callMaxDurationSec * 1000) {
        void this.closeRuntime(runtime, "hard_timeout");
      }
      if (
        runtime.lastInboundSpeechAtMs > 0 &&
        Date.now() - runtime.lastInboundSpeechAtMs > SILENCE_TIMEOUT_MS
      ) {
        this.emitLifecycle(runtime, "error", "silence_timeout");
      }
    }, 1000);
  }

  private onRtpInbound(runtime: SessionRuntime, msg: Buffer): void {
    if (runtime.closed) return;
    const parsed = parseRtpPacket(msg);
    if (!parsed) return;
    runtime.stats.packetIn++;
    runtime.jitter.push({
      sequence: parsed.sequence,
      timestamp: parsed.timestamp,
      payload: parsed.payload,
      receivedAtMs: Date.now(),
    });
    runtime.stats.packetLossEstimate = runtime.jitter.packetDrops();
    runtime.lastInboundSpeechAtMs = Date.now();
    if (runtime.aiToRtpQueue.length > 0) {
      // Minimal barge-in strategy: drop queued AI output on caller speech.
      runtime.aiToRtpQueue = [];
    }
  }

  private async flushJitterToAi(runtime: SessionRuntime): Promise<void> {
    if (runtime.closed) return;
    const popped = runtime.jitter.pop(Date.now());
    if (popped.kind !== "frame") return;
    const pcm8 = runtime.codec === "alaw" ? decodeAlaw8k(popped.packet.payload) : decodeMulaw8k(popped.packet.payload);
    const pcm16 = resample8kTo16k(pcm8);
    const chunk: AiAudioChunk = {
      pcm16leBase64: pcm16ToBase64(pcm16),
      sampleRateHz: this.config.openaiRealtimeSampleRateHz,
      channels: 1,
    };
    try {
      await runtime.ai.pushAudioInput(runtime.aiHandle, chunk);
      runtime.stats.rtpInToAiMs = Date.now() - popped.packet.receivedAtMs;
    } catch (e) {
      this.emitLifecycle(runtime, "error", String(e));
      await this.reconnectAi(runtime, "push_audio_failed");
    }
  }

  private enqueueAiOutput(runtime: SessionRuntime, chunk: AiAudioChunk, receivedAtMs: number): void {
    const pcm16 = pcm16FromBase64(chunk.pcm16leBase64);
    const pcm8 = resample16kTo8k(pcm16);
    const payload =
      runtime.codec === "alaw" ? encodeAlaw8k(pcm8) : encodeMulaw8k(pcm8);
    if (runtime.aiToRtpQueue.length >= MAX_OUTBOUND_AUDIO_QUEUE_FRAMES) {
      runtime.aiToRtpQueue.shift();
    }
    runtime.aiToRtpQueue.push({ payload, queuedAtMs: receivedAtMs });
  }

  private flushAiToRtp(runtime: SessionRuntime): void {
    if (runtime.closed) return;
    const frame = runtime.aiToRtpQueue.shift();
    if (!frame) return;
    const remoteAddress = runtime.session.rtpRemoteAddress;
    const remotePort = runtime.session.rtpRemotePort;
    if (!remoteAddress || !remotePort) return;

    const packet = buildRtpPacket({
      sequence: runtime.rtpOut.sequence,
      timestamp: runtime.rtpOut.timestamp,
      ssrc: runtime.rtpOut.ssrc,
      payloadType: payloadTypeForCodec(runtime.codec),
      payload: frame.payload,
    });
    runtime.rtpOut.sequence = (runtime.rtpOut.sequence + 1) & 0xffff;
    runtime.rtpOut.timestamp = (runtime.rtpOut.timestamp + 160) >>> 0;

    runtime.socket.send(packet, remotePort, remoteAddress, (err) => {
      if (err) {
        this.emitLifecycle(runtime, "error", String(err));
        return;
      }
      runtime.stats.packetOut++;
      runtime.stats.aiToRtpOutMs = Date.now() - frame.queuedAtMs;
    });
  }

  private async reconnectAi(runtime: SessionRuntime, reason: string): Promise<void> {
    if (runtime.closed || runtime.reconnecting) return;
    runtime.reconnecting = true;
    this.emitLifecycle(runtime, "reconnecting", reason);
    for (let i = 0; i < MAX_RECONNECT_ATTEMPTS; i++) {
      const delayMs = Math.min(1000 * 2 ** i, 8000);
      await sleep(delayMs);
      if (runtime.closed) break;
      try {
        runtime.stats.reconnectCount++;
        await runtime.ai.startConversation(runtime.aiHandle);
        this.emitLifecycle(runtime, "reconnected");
        runtime.reconnecting = false;
        return;
      } catch (e) {
        this.emitLifecycle(runtime, "error", `reconnect_attempt_${i + 1}:${String(e)}`);
      }
    }
    runtime.reconnecting = false;
    this.emitLifecycle(runtime, "disconnected", "reconnect_exhausted");
  }

  private async closeRuntime(runtime: SessionRuntime, reason: string): Promise<void> {
    if (runtime.closed) return;
    runtime.closed = true;
    this.sessions.delete(runtime.session.id);
    if (runtime.jitterTimer) clearInterval(runtime.jitterTimer);
    if (runtime.rtpOutTimer) clearInterval(runtime.rtpOutTimer);
    if (runtime.metricsTimer) clearInterval(runtime.metricsTimer);
    if (runtime.timeoutTimer) clearInterval(runtime.timeoutTimer);
    runtime.unsubAiAudio?.();
    runtime.unsubAiLifecycle?.();
    runtime.socket.removeAllListeners();
    await new Promise<void>((resolve) => runtime.socket.close(() => resolve()));
    this.emitLifecycle(runtime, "disconnected", reason);
  }

  private emitLifecycle(
    runtime: SessionRuntime,
    type: MediaLifecycleEventType,
    reason?: string,
  ): void {
    const ev: MediaLifecycleEvent = {
      sessionId: runtime.session.id,
      externalSessionId: runtime.session.externalSessionId,
      providerCallId: runtime.session.providerCallId,
      type,
      reason,
      occurredAt: new Date().toISOString(),
    };
    for (const listener of this.listeners) listener(ev);
  }
}

type SessionRuntime = {
  session: MediaBridgeSession;
  ai: AiVoiceProvider;
  aiHandle: AiSessionHandle;
  codec: RtpCodec;
  socket: dgram.Socket;
  jitter: AdaptiveJitterBuffer;
  aiToRtpQueue: Array<{ payload: Buffer; queuedAtMs: number }>;
  startedAtMs: number;
  lastInboundSpeechAtMs: number;
  rtpOut: { sequence: number; timestamp: number; ssrc: number };
  stats: {
    packetIn: number;
    packetOut: number;
    packetLossEstimate: number;
    rtpInToAiMs: number;
    aiToRtpOutMs: number;
    reconnectCount: number;
  };
  reconnecting: boolean;
  closed: boolean;
  unsubAiAudio?: () => void;
  unsubAiLifecycle?: () => void;
  jitterTimer?: NodeJS.Timeout;
  rtpOutTimer?: NodeJS.Timeout;
  metricsTimer?: NodeJS.Timeout;
  timeoutTimer?: NodeJS.Timeout;
};

const FRAME_MS = 20;
const METRICS_INTERVAL_MS = 5000;
const SILENCE_TIMEOUT_MS = 30_000;
const MAX_OUTBOUND_AUDIO_QUEUE_FRAMES = 50;
const MAX_RECONNECT_ATTEMPTS = 5;

function bindSocket(socket: dgram.Socket, localPort?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.bind(localPort ?? 0, () => {
      socket.off("error", reject);
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
