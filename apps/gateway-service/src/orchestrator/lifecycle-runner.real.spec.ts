import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AppConfig } from "../config/configuration";
import { LifecycleRunnerService } from "./lifecycle-runner.service";
import type { SessionEntity } from "../contracts/gateway.types";

function baseConfig(): AppConfig {
  return {
    port: 3100,
    logLevel: "debug",
    gatewayProviderMode: "kyivstar_openai",
    gatewayApiToken: "x",
    gatewayDebugToken: null,
    crmWebhookSecret: "x",
    crmWebhookTimeoutMs: 1000,
    crmWebhookRetryCount: 0,
    crmWebhookRetryDelayMs: 1,
    crmWebhookMaxBackoffMs: 2,
    openaiApiKey: "x",
    openaiRealtimeModel: "x",
    openaiRealtimeVoice: "x",
    kyivstarApiBaseUrl: "x",
    kyivstarApiToken: "x",
    kyivstarSipRealm: "x",
    kyivstarSipUser: "x",
    kyivstarSipPassword: "x",
    kyivstarSipProxy: "x",
    kyivstarControlPlaneMode: "http",
    kyivstarHttpTimeoutMs: 15_000,
    kyivstarHttpOutboundPath: "/v1/outbound/calls",
    kyivstarHttpStatusPathTemplate: "/v1/calls/{callId}/status",
    kyivstarHttpHangupPathTemplate: "/v1/calls/{callId}/hangup",
    kyivstarHttpHangupMethod: "POST",
    kyivstarHttpAuthStyle: "bearer",
    kyivstarHttpAuthHeaderName: "X-Api-Key",
    canaryLiveCallsEnabled: false,
    canaryAllowedE164Normalized: [],
    rtpBindAddress: "0.0.0.0",
    rtpPortStart: 30000,
    rtpPortEnd: 30999,
    openaiRealtimeWsUrl: "ws://localhost",
    openaiRealtimeSampleRateHz: 16000,
    callMaxDurationSec: 2,
    callMaxTurns: 6,
    realModeEnabled: true,
    realModePercent: 100,
  };
}

function makeSession(): SessionEntity {
  const now = new Date().toISOString();
  return {
    externalSessionId: "ext-1",
    attemptId: "att-1",
    campaignId: "camp-1",
    scenarioCode: "LEAD_QUALIFICATION",
    scenarioVersion: "1",
    scenarioKey: "LEAD_QUALIFICATION@1",
    phone: "+380501112233",
    phoneNormalized: "380501112233",
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
    webhookUrl: "https://crm.test/webhook",
    webhookSecretHeader: "x-outbound-voice-secret",
    context: {},
    timestamps: { createdAt: now, updatedAt: now, enteredQueuedAt: now },
  };
}

describe("LifecycleRunner real mode", () => {
  it("does not use deterministic fixtures and emits terminal once", async () => {
    let s = makeSession();
    const sent: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const artifactListeners = new Set<
      (event: {
        type: "transcript_delta" | "transcript_final" | "summary" | "classification";
        transcript?: string;
        summary?: string;
        outcomeKey?: string;
        fields?: Record<string, unknown>;
      }) => void
    >();

    const ai = {
      async createSession() {
        return { openaiSessionId: "openai-1" };
      },
      async sendContext() {},
      async startConversation() {
        for (const l of artifactListeners) l({ type: "transcript_final", transcript: "Real runtime transcript" });
        for (const l of artifactListeners) l({ type: "summary", summary: "Real runtime summary" });
        for (const l of artifactListeners)
          l({ type: "classification", outcomeKey: "CONTACTED", fields: { source: "runtime" } });
      },
      async pushAudioInput() {},
      onAudioOutput() {
        return () => undefined;
      },
      onRuntimeArtifact(_: unknown, listener: (event: never) => void) {
        artifactListeners.add(listener as never);
        return () => artifactListeners.delete(listener as never);
      },
      async handleToolInvocation() {
        return {};
      },
      async closeSession() {},
    };

    let statusChecks = 0;
    const telephony = {
      async createOutboundLeg() {
        return { providerCallId: "prov-1", providerSessionId: "sess-1" };
      },
      async getCallStatus() {
        statusChecks++;
        if (statusChecks < 2) return { status: "ringing" as const };
        if (statusChecks < 4) return { status: "answered" as const };
        return { status: "completed" as const };
      },
      async transferCall() {},
      async hangupCall() {},
      subscribe() {
        return () => undefined;
      },
    };

    const mediaListeners = new Set<
      (event: { sessionId: string; type: "connected" | "disconnected" | "reconnecting" | "reconnected" | "error" }) => void
    >();
    const mediaBridge = {
      async connect() {
        return { id: "media-1", externalSessionId: s.externalSessionId, providerCallId: "prov-1", aiSessionId: "openai-1" };
      },
      async pumpInboundAudio() {},
      async close() {},
      onLifecycleEvent(listener: (event: never) => void) {
        mediaListeners.add(listener as never);
        return () => mediaListeners.delete(listener as never);
      },
    };

    const service = new LifecycleRunnerService(
      baseConfig(),
      mediaBridge as never,
      mediaBridge as never,
      {
        telephonyProvider: () => telephony,
        aiProvider: () => ai,
      } as never,
      {
        transition: (_id: string, to: SessionEntity["lifecycleStatus"]) => {
          s = { ...s, lifecycleStatus: to };
          return s;
        },
        patch: (_id: string, patch: Partial<SessionEntity>) => {
          s = { ...s, ...patch, correlationIds: { ...s.correlationIds, ...(patch.correlationIds ?? {}) } };
          return s;
        },
        get: () => s,
      } as never,
      {
        append: () => undefined,
      } as never,
      {
        newDeliveryId: (() => {
          let i = 0;
          return () => `d-${++i}`;
        })(),
      } as never,
      {
        sendToCrm: async (_session: SessionEntity, ev: { eventType: string; payload: Record<string, unknown> }) => {
          sent.push({ eventType: ev.eventType, payload: ev.payload });
          return { ok: true };
        },
      } as never,
      {
        log: () => undefined,
        debug: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      } as never,
    );

    await service.runRealLifecycle(s, undefined);

    const types = sent.map((x) => x.eventType);
    assert.ok(types.includes("attempt.transcript.final"));
    assert.ok(types.includes("attempt.summary.ready"));
    assert.ok(types.includes("attempt.classification.ready"));
    assert.equal(types.filter((t) => t === "attempt.completed").length, 1);
    assert.equal(types.filter((t) => t === "attempt.failed").length, 0);
    const fixtureLeak = sent.some((e) => JSON.stringify(e.payload).includes("gateway_mock"));
    assert.equal(fixtureLeak, false);
  });
});
