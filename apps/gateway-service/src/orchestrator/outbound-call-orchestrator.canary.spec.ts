import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../config/configuration";
import type { SessionEntity } from "../contracts/gateway.types";
import { OutboundCallOrchestratorService } from "./outbound-call-orchestrator.service";
import { StructuredLogger } from "../common/structured-logger";

function baseCfg(over: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 3100,
    logLevel: "error",
    gatewayProviderMode: "kyivstar_openai",
    gatewayApiToken: "t",
    gatewayDebugToken: null,
    crmWebhookSecret: "s",
    crmWebhookTimeoutMs: 1000,
    crmWebhookRetryCount: 0,
    crmWebhookRetryDelayMs: 1,
    crmWebhookMaxBackoffMs: 2,
    openaiApiKey: "",
    openaiRealtimeModel: "m",
    openaiRealtimeVoice: "v",
    openaiRealtimeWsUrl: "wss://x",
    openaiRealtimeSampleRateHz: 16_000,
    kyivstarApiBaseUrl: "https://k",
    kyivstarApiToken: "k",
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
    rtpBindAddress: "0.0.0.0",
    rtpPortStart: 30_000,
    rtpPortEnd: 30_999,
    callMaxDurationSec: 180,
    callMaxTurns: 6,
    realModeEnabled: true,
    realModePercent: 100,
    canaryLiveCallsEnabled: false,
    canaryAllowedE164Normalized: [],
    ...over,
  };
}

function session(phone: string): SessionEntity {
  const now = new Date().toISOString();
  return {
    externalSessionId: "ext-1",
    attemptId: "att-1",
    campaignId: "c",
    scenarioCode: "X",
    scenarioVersion: "1",
    scenarioKey: "X@1",
    phone,
    phoneNormalized: phone.replace(/\D/g, ""),
    leadId: null,
    contactId: null,
    companyId: null,
    mockOutcome: "default",
    lifecycleStatus: "queued",
    subStatuses: {
      transcriptStatus: "pending",
      summaryStatus: "pending",
      classificationStatus: "pending",
      catalogIntentStatus: "pending",
      callbackIntentStatus: "pending",
      transferStatus: "pending",
    },
    correlationIds: {
      externalSessionId: "ext-1",
      providerCallId: null,
      openaiCallId: null,
      recordingId: null,
      transcriptId: null,
    },
    providerSessionId: null,
    providerLabel: "kyivstar_openai",
    webhookUrl: "https://crm.test/hook",
    webhookSecretHeader: "x-secret",
    context: {},
    timestamps: { createdAt: now, updatedAt: now, enteredQueuedAt: now },
  };
}

describe("OutboundCallOrchestratorService canary", () => {
  it("runs canary blocked instead of real when whitelist rejects destination", async () => {
    const calls: string[] = [];
    const lifecycle = {
      runCanaryBlocked: async () => {
        calls.push("canary_blocked");
      },
      runRealLifecycle: async () => {
        calls.push("real");
      },
      runMockLifecycle: async () => {
        calls.push("mock");
      },
    };
    const registry = {
      transition: () => undefined,
    };
    const orch = new OutboundCallOrchestratorService(
      registry as never,
      lifecycle as never,
      baseCfg({
        canaryLiveCallsEnabled: true,
        canaryAllowedE164Normalized: ["380501112233"],
      }),
      new StructuredLogger(),
    );
    orch.enqueueFlow(session("+380501112299"));
    await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(calls, ["canary_blocked"]);
  });

  it("runs real when canary enabled and phone is whitelisted", async () => {
    const calls: string[] = [];
    const lifecycle = {
      runCanaryBlocked: async () => {
        calls.push("canary_blocked");
      },
      runRealLifecycle: async () => {
        calls.push("real");
      },
      runMockLifecycle: async () => {
        calls.push("mock");
      },
    };
    const registry = {
      transition: () => undefined,
    };
    const orch = new OutboundCallOrchestratorService(
      registry as never,
      lifecycle as never,
      baseCfg({
        canaryLiveCallsEnabled: true,
        canaryAllowedE164Normalized: ["380501112233"],
      }),
      new StructuredLogger(),
    );
    orch.enqueueFlow(session("+380 50 111 2233"));
    await new Promise((r) => setTimeout(r, 25));
    assert.deepEqual(calls, ["real"]);
  });
});
