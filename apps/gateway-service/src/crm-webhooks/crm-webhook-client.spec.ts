import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { CrmWebhookClientService } from "./crm-webhook-client.service";
import { CrmWebhookSignatureService } from "./crm-webhook-signature.service";
import { DeliveryLogService } from "./delivery-log.service";
import { InMemoryDeliveryLogStore } from "../storage/in-memory-delivery-log.store";
import { StructuredLogger } from "../common/structured-logger";
import type { AppConfig } from "../config/configuration";
import type { SessionEntity } from "../contracts/gateway.types";
import type { GatewayOutboundEvent } from "../contracts/gateway.types";

const baseConfig: AppConfig = {
  port: 3100,
  logLevel: "error",
  gatewayProviderMode: "mock",
  gatewayApiToken: "t",
  gatewayDebugToken: null,
  crmWebhookSecret: "secret",
  crmWebhookTimeoutMs: 5000,
  crmWebhookRetryCount: 2,
  crmWebhookRetryDelayMs: 1,
  crmWebhookMaxBackoffMs: 10,
  openaiApiKey: "",
  openaiRealtimeModel: "",
  openaiRealtimeVoice: "",
  openaiRealtimeWsUrl: "",
  openaiRealtimeSampleRateHz: 16000,
  kyivstarApiBaseUrl: "",
  kyivstarApiToken: "",
  kyivstarSipRealm: "",
  kyivstarSipUser: "",
  kyivstarSipPassword: "",
  kyivstarSipProxy: "",
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
  callMaxDurationSec: 180,
  callMaxTurns: 6,
  realModeEnabled: false,
  realModePercent: 0,
};

function session(over?: Partial<SessionEntity>): SessionEntity {
  const now = new Date().toISOString();
  return {
    externalSessionId: "ext",
    attemptId: "att",
    campaignId: "c",
    scenarioCode: "S",
    scenarioVersion: "1",
    scenarioKey: "S@1",
    phone: "+10000000000",
    phoneNormalized: "10000000000",
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
      externalSessionId: "ext",
      providerCallId: null,
      openaiCallId: null,
      recordingId: null,
      transcriptId: null,
    },
    providerSessionId: null,
    providerLabel: "mock",
    webhookUrl: "https://crm.example/hook",
    webhookSecretHeader: "x-outbound-voice-secret",
    context: {},
    timestamps: {
      createdAt: now,
      updatedAt: now,
      enteredQueuedAt: now,
    },
    ...over,
  };
}

describe("CrmWebhookClientService", () => {
  let store: InMemoryDeliveryLogStore;
  let deliveryLog: DeliveryLogService;
  let client: CrmWebhookClientService;

  beforeEach(() => {
    store = new InMemoryDeliveryLogStore();
    deliveryLog = new DeliveryLogService(store);
    const log = new StructuredLogger();
    client = new CrmWebhookClientService(
      baseConfig,
      new CrmWebhookSignatureService(baseConfig),
      deliveryLog,
      log,
    );
  });

  it("retries then succeeds and logs delivery with tryCount", async () => {
    let calls = 0;
    const fetchMock: typeof fetch = async () => {
      calls += 1;
      if (calls < 2) {
        return new Response("err", { status: 500 });
      }
      return new Response("{}", { status: 200 });
    };

    const ev: GatewayOutboundEvent = {
      eventType: "attempt.started",
      deliveryId: "del-1",
      attemptId: "att",
      providerSessionId: null,
      externalSessionId: "ext",
      correlationIds: session().correlationIds,
      occurredAt: new Date().toISOString(),
      payload: {},
    };

    const res = await client.sendToCrm(session(), ev, fetchMock);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls, 2);
    const rec = store.get("del-1");
    assert.ok(rec);
    assert.strictEqual(rec!.tryCount, 2);
    assert.strictEqual(rec!.lastStatus, "success");
  });

  it("skips when no webhookUrl", async () => {
    const ev: GatewayOutboundEvent = {
      eventType: "attempt.started",
      deliveryId: "del-2",
      attemptId: "att",
      providerSessionId: null,
      externalSessionId: "ext",
      correlationIds: session().correlationIds,
      occurredAt: new Date().toISOString(),
      payload: {},
    };
    const res = await client.sendToCrm(session({ webhookUrl: null }), ev);
    assert.strictEqual(res.ok, false);
  });
});
