import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AiAudioChunk, AiSessionHandle, AiVoiceProvider } from "../providers/ai-voice-provider.interface";
import type { AppConfig } from "../config/configuration";
import { StructuredLogger } from "../common/structured-logger";
import { RtpOpenAiMediaBridgeService } from "./rtp-openai-media-bridge.service";
import { encodeMulaw8k } from "./codecs/g711";
import { pcm16ToBase64 } from "./codecs/resample";
import { FakeRtpPeer } from "./rtp/fake-rtp-peer";

class FakeAiProvider implements AiVoiceProvider {
  readonly inputChunks: AiAudioChunk[] = [];
  readonly lifecycleEvents: Array<{ type: "connected" | "disconnected" | "error"; reason?: string }> = [];
  private readonly outputListeners = new Map<string, Set<(audio: AiAudioChunk) => void>>();
  private readonly lifecycleListeners = new Map<
    string,
    Set<(event: { type: "connected" | "disconnected" | "error"; reason?: string }) => void>
  >();
  reconnectFailures = 0;

  async createSession(): Promise<AiSessionHandle> {
    return { openaiSessionId: "fake-ai" };
  }
  async sendContext(): Promise<void> {}
  async startConversation(handle: AiSessionHandle): Promise<void> {
    if (this.reconnectFailures > 0) {
      this.reconnectFailures--;
      throw new Error("reconnect_failed");
    }
    this.emitLifecycle(handle.openaiSessionId, { type: "connected" });
  }
  async pushAudioInput(_: AiSessionHandle, audio: AiAudioChunk): Promise<void> {
    this.inputChunks.push(audio);
  }
  onAudioOutput(handle: AiSessionHandle, listener: (audio: AiAudioChunk) => void): () => void {
    if (!this.outputListeners.has(handle.openaiSessionId)) {
      this.outputListeners.set(handle.openaiSessionId, new Set());
    }
    const set = this.outputListeners.get(handle.openaiSessionId)!;
    set.add(listener);
    return () => set.delete(listener);
  }
  async handleToolInvocation(): Promise<unknown> {
    return {};
  }
  async closeSession(): Promise<void> {}
  onSessionLifecycle(
    handle: AiSessionHandle,
    listener: (event: { type: "connected" | "disconnected" | "error"; reason?: string }) => void,
  ): () => void {
    if (!this.lifecycleListeners.has(handle.openaiSessionId)) {
      this.lifecycleListeners.set(handle.openaiSessionId, new Set());
    }
    const set = this.lifecycleListeners.get(handle.openaiSessionId)!;
    set.add(listener);
    return () => set.delete(listener);
  }

  emitAudio(handleId: string, audio: AiAudioChunk): void {
    const set = this.outputListeners.get(handleId);
    if (!set) return;
    for (const listener of set) listener(audio);
  }

  emitLifecycle(handleId: string, event: { type: "connected" | "disconnected" | "error"; reason?: string }): void {
    this.lifecycleEvents.push(event);
    const set = this.lifecycleListeners.get(handleId);
    if (!set) return;
    for (const listener of set) listener(event);
  }
}

function testConfig(): AppConfig {
  return {
    port: 3100,
    logLevel: "debug",
    gatewayProviderMode: "kyivstar_openai",
    gatewayApiToken: "x",
    gatewayDebugToken: null,
    crmWebhookSecret: "x",
    crmWebhookTimeoutMs: 1000,
    crmWebhookRetryCount: 0,
    crmWebhookRetryDelayMs: 10,
    crmWebhookMaxBackoffMs: 10,
    openaiApiKey: "x",
    openaiRealtimeModel: "x",
    openaiRealtimeVoice: "x",
    kyivstarApiBaseUrl: "x",
    kyivstarApiToken: "x",
    kyivstarSipRealm: "x",
    kyivstarSipUser: "x",
    kyivstarSipPassword: "x",
    kyivstarSipProxy: "x",
    rtpBindAddress: "127.0.0.1",
    rtpPortStart: 30000,
    rtpPortEnd: 30999,
    openaiRealtimeWsUrl: "ws://localhost",
    openaiRealtimeSampleRateHz: 16000,
    callMaxDurationSec: 60,
    callMaxTurns: 10,
    realModeEnabled: true,
    realModePercent: 100,
  };
}

describe("rtp-openai media bridge integration", () => {
  it("passes bidirectional audio and reconnect events", async () => {
    const ai = new FakeAiProvider();
    const peer = new FakeRtpPeer();
    const remotePort = await peer.bind();
    const bridge = new RtpOpenAiMediaBridgeService(testConfig(), new StructuredLogger());
    const lifecycle: string[] = [];
    const un = bridge.onLifecycleEvent((ev) => lifecycle.push(ev.type));

    const session = await bridge.connect({
      externalSessionId: "ext-1",
      providerCallId: "call-1",
      aiSessionId: "fake-ai",
      telephony: {} as never,
      ai,
      rtp: { codec: "mulaw", localPort: 0, remoteAddress: "127.0.0.1", remotePort },
    });
    try {
      assert.ok(session.rtpLocalPort);

      const tone8k = new Int16Array(160);
      for (let i = 0; i < tone8k.length; i++) tone8k[i] = (Math.sin((i / 20) * Math.PI) * 3000) | 0;
      for (let i = 0; i < 4; i++) {
        await peer.sendFrame(session.rtpLocalPort!, encodeMulaw8k(tone8k), 0);
      }
      await sleep(220);
      assert.ok(ai.inputChunks.length >= 1, "expected inbound RTP to reach AI input");

      const tone16k = new Int16Array(320);
      for (let i = 0; i < tone16k.length; i++) tone16k[i] = (Math.sin((i / 40) * Math.PI) * 2000) | 0;
      ai.emitAudio("fake-ai", {
        pcm16leBase64: pcm16ToBase64(tone16k),
        sampleRateHz: 16000,
        channels: 1,
      });
      await sleep(120);
      const outbound = peer.takeReceived();
      assert.ok(outbound.length >= 1, "expected AI audio to be emitted as RTP");

      ai.reconnectFailures = 1;
      ai.emitLifecycle("fake-ai", { type: "disconnected", reason: "test_drop" });
      await sleep(3400);
      assert.ok(lifecycle.includes("reconnecting"));
      assert.ok(lifecycle.includes("reconnected"));
    } finally {
      await bridge.close(session.id);
      await peer.close();
      un();
      await sleep(20);
    }
    assert.ok(lifecycle.includes("disconnected"));
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
