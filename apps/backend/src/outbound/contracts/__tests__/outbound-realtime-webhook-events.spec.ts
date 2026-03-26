import { describe, it } from "node:test";
import assert from "node:assert";
import { isOutboundRealtimeEventType } from "../outbound-realtime-webhook-events";

describe("outbound-realtime-webhook-events", () => {
  it("recognizes known event types", () => {
    assert.strictEqual(isOutboundRealtimeEventType("attempt.completed"), true);
    assert.strictEqual(isOutboundRealtimeEventType("attempt.failed"), true);
    assert.strictEqual(isOutboundRealtimeEventType("unknown.foo"), false);
  });
});
