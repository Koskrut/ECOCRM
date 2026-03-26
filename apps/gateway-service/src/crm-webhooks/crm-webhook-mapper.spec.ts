import { describe, it } from "node:test";
import assert from "node:assert";
import { toCrmWebhookBody } from "./crm-webhook-mapper";
import type { GatewayOutboundEvent } from "../contracts/gateway.types";

describe("crm-webhook-mapper", () => {
  it("puts externalSessionId under correlationIds and occurredAt in payload", () => {
    const ev: GatewayOutboundEvent = {
      eventType: "attempt.started",
      deliveryId: "d1",
      attemptId: "a1",
      providerSessionId: null,
      externalSessionId: "ext-1",
      correlationIds: {
        externalSessionId: "ext-1",
        providerCallId: null,
        openaiCallId: null,
        recordingId: null,
        transcriptId: null,
      },
      occurredAt: "2025-01-01T00:00:00.000Z",
      payload: { x: 1 },
    };
    const body = toCrmWebhookBody(ev) as Record<string, unknown>;
    const corr = body.correlationIds as Record<string, unknown>;
    assert.strictEqual(corr.externalSessionId, "ext-1");
    const payload = body.payload as Record<string, unknown>;
    assert.strictEqual(payload.occurredAt, "2025-01-01T00:00:00.000Z");
    assert.strictEqual(payload.x, 1);
  });
});
