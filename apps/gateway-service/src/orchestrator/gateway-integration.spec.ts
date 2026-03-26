import "reflect-metadata";

process.env.GATEWAY_API_TOKEN = "integration-test-token";
process.env.CRM_WEBHOOK_SECRET = "integration-wh-secret";
process.env.GATEWAY_PROVIDER_MODE = "mock";
process.env.CRM_WEBHOOK_RETRY_COUNT = "0";
process.env.CRM_WEBHOOK_RETRY_DELAY_MS = "1";
process.env.CRM_WEBHOOK_MAX_BACKOFF_MS = "2";

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { Test } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../app.module";

describe("gateway integration", () => {
  let app: INestApplication;
  const received: { url: string; body: unknown }[] = [];

  before(async () => {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      received.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
      }),
    );
    await app.init();
  });

  after(async () => {
    await app.close();
  });

  it("rejects missing bearer", async () => {
    await request(app.getHttpServer())
      .post("/v1/outbound/calls")
      .send({})
      .expect(401);
  });

  it("POST create-call returns session_id and runs mock lifecycle webhooks", async () => {
    received.length = 0;
    const res = await request(app.getHttpServer())
      .post("/v1/outbound/calls")
      .set("Authorization", "Bearer integration-test-token")
      .send({
        attemptId: "att-int-1",
        campaignId: "camp-1",
        scenarioCode: "LEAD_QUALIFICATION",
        scenarioVersion: "1",
        scenarioKey: "LEAD_QUALIFICATION@1",
        phone: "+380501112233",
        phoneNormalized: "380501112233",
        context: {},
        crmContext: { mockOutcome: "default" },
        callback: {
          webhookUrl: "https://crm.test/webhook",
          webhookSecretHeader: "x-outbound-voice-secret",
        },
      })
      .expect(200);

    assert.strictEqual(res.body.accepted, true);
    assert.ok(typeof res.body.externalSessionId === "string");
    assert.strictEqual(res.body.session_id, res.body.externalSessionId);

    const extId = res.body.externalSessionId as string;

    await new Promise((r) => setTimeout(r, 400));

    const types = received.map((r) => (r.body as { eventType?: string }).eventType);
    assert.ok(types.includes("attempt.started"));
    assert.ok(types.includes("attempt.completed"));

    const sess = await request(app.getHttpServer())
      .get(`/v1/sessions/${extId}`)
      .set("Authorization", "Bearer integration-test-token")
      .expect(200);

    assert.strictEqual(sess.body.lifecycleStatus, "completed");
    assert.strictEqual(sess.body.attemptId, "att-int-1");
  });

  it("callback_requested emits attempt.transfer.requested with callback_request intent for CRM task", async () => {
    received.length = 0;
    const res = await request(app.getHttpServer())
      .post("/v1/outbound/calls")
      .set("Authorization", "Bearer integration-test-token")
      .send({
        attemptId: "att-cb-1",
        campaignId: "camp-1",
        scenarioCode: "LEAD_QUALIFICATION",
        scenarioVersion: "1",
        scenarioKey: "LEAD_QUALIFICATION@1",
        phone: "+380501112233",
        context: {},
        crmContext: { mockOutcome: "callback_requested" },
        callback: {
          webhookUrl: "https://crm.test/webhook",
          webhookSecretHeader: "x-outbound-voice-secret",
        },
      })
      .expect(200);

    await new Promise((r) => setTimeout(r, 450));

    const transfer = received.find(
      (r) => (r.body as { eventType?: string }).eventType === "attempt.transfer.requested",
    );
    assert.ok(transfer, "expected attempt.transfer.requested");
    const body = transfer!.body as {
      eventType?: string;
      payload?: { intent?: string; preferredWindow?: string };
      fields?: { callbackIntent?: boolean };
    };
    assert.strictEqual(body.payload?.intent, "callback_request");
    assert.ok(body.fields?.callbackIntent);
    assert.ok(body.payload?.preferredWindow);

    const extId = res.body.externalSessionId as string;
    const sess = await request(app.getHttpServer())
      .get(`/v1/sessions/${extId}`)
      .set("Authorization", "Bearer integration-test-token")
      .expect(200);
    assert.strictEqual(sess.body.lifecycleStatus, "completed");
  });
});
