import { describe, it } from "node:test";
import assert from "node:assert";
import type { AppConfig } from "../config/configuration";
import { MockTelephonyProvider } from "./mock-telephony.provider";
import { KyivstarTelephonyProvider } from "./kyivstar.provider";
import { MockAiVoiceProvider } from "./mock-ai-voice.provider";
import { OpenAiRealtimeVoiceProvider } from "./openai-realtime.provider";
import { ProviderRuntimeResolverService } from "./provider-runtime-resolver.service";
import { StructuredLogger } from "../common/structured-logger";

function cfg(mode: "mock" | "kyivstar_openai"): AppConfig {
  return {
    port: 3100,
    logLevel: "info",
    gatewayProviderMode: mode,
    gatewayApiToken: "t",
    gatewayDebugToken: null,
    crmWebhookSecret: "s",
    crmWebhookTimeoutMs: 1000,
    crmWebhookRetryCount: 1,
    crmWebhookRetryDelayMs: 10,
    crmWebhookMaxBackoffMs: 20,
    openaiApiKey: "k",
    openaiRealtimeModel: "m",
    openaiRealtimeVoice: "v",
    kyivstarApiBaseUrl: "https://k",
    kyivstarApiToken: "k",
    kyivstarSipRealm: "r",
    kyivstarSipUser: "u",
    kyivstarSipPassword: "p",
    kyivstarSipProxy: "proxy",
    kyivstarControlPlaneMode: "http",
    kyivstarHttpTimeoutMs: 15_000,
    kyivstarHttpOutboundPath: "/v1/outbound/calls",
    kyivstarHttpStatusPathTemplate: "/v1/calls/{callId}/status",
    kyivstarHttpHangupPathTemplate: "/v1/calls/{callId}/hangup",
    kyivstarHttpHangupMethod: "POST",
    kyivstarHttpMediaPathTemplate: "/v1/calls/{callId}/media",
    kyivstarHttpAuthStyle: "bearer",
    kyivstarHttpAuthHeaderName: "X-Api-Key",
    canaryLiveCallsEnabled: false,
    canaryAllowedE164Normalized: [],
    rtpBindAddress: "0.0.0.0",
    rtpAdvertiseAddress: "0.0.0.0",
    rtpPortStart: 30000,
    rtpPortEnd: 30999,
    openaiRealtimeWsUrl: "wss://example.test",
    openaiRealtimeSampleRateHz: 16000,
    callMaxDurationSec: 180,
    callMaxTurns: 6,
    realModeEnabled: false,
    realModePercent: 0,
  };
}

describe("ProviderRuntimeResolverService", () => {
  it("returns mock providers in mock mode", () => {
    const log = new StructuredLogger();
    const resolver = new ProviderRuntimeResolverService(
      cfg("mock"),
      new MockTelephonyProvider(),
      new KyivstarTelephonyProvider(cfg("mock"), log),
      new MockAiVoiceProvider(),
      new OpenAiRealtimeVoiceProvider(cfg("mock"), log),
    );
    assert.ok(resolver.telephonyProvider() instanceof MockTelephonyProvider);
    assert.ok(resolver.aiProvider() instanceof MockAiVoiceProvider);
  });

  it("returns kyivstar/openai providers in real mode", () => {
    const log = new StructuredLogger();
    const resolver = new ProviderRuntimeResolverService(
      cfg("kyivstar_openai"),
      new MockTelephonyProvider(),
      new KyivstarTelephonyProvider(cfg("kyivstar_openai"), log),
      new MockAiVoiceProvider(),
      new OpenAiRealtimeVoiceProvider(cfg("kyivstar_openai"), log),
    );
    assert.ok(resolver.telephonyProvider() instanceof KyivstarTelephonyProvider);
    assert.ok(resolver.aiProvider() instanceof OpenAiRealtimeVoiceProvider);
  });
});
