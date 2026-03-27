import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import type { AppConfig } from "../config/configuration";
import { StructuredLogger } from "../common/structured-logger";
import { KyivstarTelephonyProvider } from "./kyivstar.provider";

function appConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3100,
    logLevel: "error",
    gatewayProviderMode: "kyivstar_openai",
    gatewayApiToken: "t",
    gatewayDebugToken: null,
    crmWebhookSecret: "s",
    crmWebhookTimeoutMs: 1000,
    crmWebhookRetryCount: 1,
    crmWebhookRetryDelayMs: 10,
    crmWebhookMaxBackoffMs: 20,
    openaiApiKey: "",
    openaiRealtimeModel: "m",
    openaiRealtimeVoice: "v",
    openaiRealtimeWsUrl: "wss://x",
    openaiRealtimeSampleRateHz: 16_000,
    kyivstarApiBaseUrl: "https://kyivstar.test",
    kyivstarApiToken: "token",
    kyivstarSipRealm: "",
    kyivstarSipUser: "",
    kyivstarSipPassword: "",
    kyivstarSipProxy: "",
    kyivstarControlPlaneMode: "http",
    kyivstarHttpTimeoutMs: 5000,
    kyivstarHttpOutboundPath: "/v1/outbound/calls",
    kyivstarHttpStatusPathTemplate: "/v1/calls/{callId}/status",
    kyivstarHttpHangupPathTemplate: "/v1/calls/{callId}/hangup",
    kyivstarHttpHangupMethod: "POST",
    kyivstarHttpAuthStyle: "bearer",
    kyivstarHttpAuthHeaderName: "X-Api-Key",
    canaryLiveCallsEnabled: false,
    canaryAllowedE164Normalized: [],
    rtpBindAddress: "0.0.0.0",
    rtpPortStart: 30_000,
    rtpPortEnd: 30_999,
    callMaxDurationSec: 180,
    callMaxTurns: 6,
    realModeEnabled: false,
    realModePercent: 0,
    ...over,
  };
}

describe("KyivstarTelephonyProvider", () => {
  let origFetch: typeof fetch;
  let origSetTimeout: typeof setTimeout;
  let setTimeoutCalls: number;

  beforeEach(() => {
    origFetch = globalThis.fetch;
    setTimeoutCalls = 0;
    origSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: Parameters<typeof setTimeout>[0], delay?: number, ...args: unknown[]) => {
      setTimeoutCalls++;
      return origSetTimeout(fn, delay, ...args);
    }) as typeof setTimeout;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
    globalThis.setTimeout = origSetTimeout;
  });

  it("http mode: createOutboundLeg uses fetch and does not schedule synthetic leg timers", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/v1/outbound/calls")) {
        return new Response(JSON.stringify({ callId: "real-call-1", status: "dialing" }), { status: 200 });
      }
      if (u.includes("/v1/calls/real-call-1/status")) {
        return new Response(JSON.stringify({ status: "answered" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const p = new KyivstarTelephonyProvider(appConfig({ kyivstarControlPlaneMode: "http" }), new StructuredLogger());
    const before = setTimeoutCalls;
    const leg = await p.createOutboundLeg({
      externalSessionId: "ext-1",
      e164Phone: "+380501112233",
      attemptId: "a1",
    });
    assert.strictEqual(leg.providerCallId, "real-call-1");
    // HTTP client uses one abort timer per request — not the synthetic ringing/answered pair.
    assert.strictEqual(setTimeoutCalls, before + 1);
    const st = await p.getCallStatus("real-call-1");
    assert.strictEqual(st.status, "answered");
    assert.strictEqual(setTimeoutCalls, before + 2);
  });

  it("http mode: hangupCall issues control-plane request and throws on HTTP error", async () => {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(input));
      const u = String(input);
      if (u.includes("/v1/outbound/calls")) {
        return new Response(JSON.stringify({ callId: "c-hang" }), { status: 200 });
      }
      if (u.includes("/hangup")) {
        assert.strictEqual(init?.method, "POST");
        return new Response(JSON.stringify({ ok: true }), { status: 500 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const p = new KyivstarTelephonyProvider(appConfig(), new StructuredLogger());
    await p.createOutboundLeg({ externalSessionId: "e", e164Phone: "+1", attemptId: "a" });
    await assert.rejects(() => p.hangupCall("c-hang"), /KYIVSTAR_HANGUP_FAILED/);
    assert.ok(urls.some((u) => u.includes("/v1/calls/c-hang/hangup")));
  });

  it("http mode: transferCall is explicitly degraded", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ callId: "x" }), { status: 200 })) as typeof fetch;
    const p = new KyivstarTelephonyProvider(appConfig(), new StructuredLogger());
    await p.createOutboundLeg({ externalSessionId: "e", e164Phone: "+1", attemptId: "a" });
    await assert.rejects(() => p.transferCall("x", "+380501112233"), /KYIVSTAR_TRANSFER_NOT_SUPPORTED/);
  });

  it("synthetic mode: uses timers for staged states (dev only)", async () => {
    const p = new KyivstarTelephonyProvider(
      appConfig({ kyivstarControlPlaneMode: "synthetic" }),
      new StructuredLogger(),
    );
    const before = setTimeoutCalls;
    await p.createOutboundLeg({ externalSessionId: "e", e164Phone: "+1", attemptId: "a" });
    assert.ok(setTimeoutCalls > before);
  });

  it("emits terminal failed after repeated status failures", async () => {
    let statusHits = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/v1/outbound/calls")) {
        return new Response(JSON.stringify({ callId: "bad-status" }), { status: 200 });
      }
      if (u.includes("/status")) {
        statusHits++;
        return new Response("err", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const p = new KyivstarTelephonyProvider(appConfig(), new StructuredLogger());
    await p.createOutboundLeg({ externalSessionId: "e", e164Phone: "+1", attemptId: "a" });
    const events: string[] = [];
    const off = p.subscribe((ev) => events.push(ev.state));
    for (let i = 0; i < 6; i++) {
      await p.getCallStatus("bad-status");
    }
    off();
    assert.ok(statusHits >= 5);
    assert.ok(events.includes("failed"));
  });

  it("dedupes repeated identical status emissions", async () => {
    let n = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("/v1/outbound/calls")) {
        return new Response(JSON.stringify({ callId: "dedup" }), { status: 200 });
      }
      if (u.includes("/status")) {
        n++;
        return new Response(JSON.stringify({ status: "answered" }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const p = new KyivstarTelephonyProvider(appConfig(), new StructuredLogger());
    await p.createOutboundLeg({ externalSessionId: "e", e164Phone: "+1", attemptId: "a" });
    const states: string[] = [];
    const off = p.subscribe((ev) => states.push(ev.state));
    await p.getCallStatus("dedup");
    await p.getCallStatus("dedup");
    off();
    assert.strictEqual(states.filter((s) => s === "answered").length, 1, "same state should not re-emit");
    assert.ok(n >= 2);
  });
});
