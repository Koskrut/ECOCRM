import { afterEach, describe, it } from "node:test";
import assert from "node:assert";
import { loadConfiguration } from "./configuration";

describe("loadConfiguration real-mode fields", () => {
  const snapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...snapshot };
  });

  it("reads rollout and transport fields", () => {
    process.env.GATEWAY_API_TOKEN = "token";
    process.env.CRM_WEBHOOK_SECRET = "secret";
    process.env.GATEWAY_PROVIDER_MODE = "kyivstar_openai";
    process.env.REAL_MODE_ENABLED = "true";
    process.env.REAL_MODE_PERCENT = "25";
    process.env.RTP_PORT_START = "31000";
    process.env.RTP_PORT_END = "31999";
    process.env.OPENAI_REALTIME_WS_URL = "wss://example.openai.test/realtime";
    process.env.KYIVSTAR_CONTROL_PLANE_MODE = "http";
    process.env.KYIVSTAR_HTTP_TIMEOUT_MS = "12000";
    process.env.CANARY_LIVE_CALLS_ENABLED = "true";
    process.env.CANARY_ALLOWED_E164 = "+380501112233";
    process.env.KYIVSTAR_HTTP_AUTH_STYLE = "bearer";
    process.env.KYIVSTAR_HTTP_MEDIA_PATH_TEMPLATE = "/v1/calls/{callId}/media";
    process.env.RTP_ADVERTISE_ADDRESS = "159.195.31.153";

    const cfg = loadConfiguration();
    assert.strictEqual(cfg.gatewayProviderMode, "kyivstar_openai");
    assert.strictEqual(cfg.realModeEnabled, true);
    assert.strictEqual(cfg.realModePercent, 25);
    assert.strictEqual(cfg.rtpPortStart, 31000);
    assert.strictEqual(cfg.rtpPortEnd, 31999);
    assert.strictEqual(cfg.openaiRealtimeWsUrl, "wss://example.openai.test/realtime");
    assert.strictEqual(cfg.kyivstarControlPlaneMode, "http");
    assert.strictEqual(cfg.kyivstarHttpTimeoutMs, 12000);
    assert.strictEqual(cfg.canaryLiveCallsEnabled, true);
    assert.ok(cfg.canaryAllowedE164Normalized.includes("380501112233"));
    assert.strictEqual(cfg.kyivstarHttpAuthStyle, "bearer");
    assert.strictEqual(cfg.kyivstarHttpMediaPathTemplate, "/v1/calls/{callId}/media");
    assert.strictEqual(cfg.rtpAdvertiseAddress, "159.195.31.153");
  });
});
