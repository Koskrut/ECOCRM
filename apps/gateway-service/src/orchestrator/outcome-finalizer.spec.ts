import { describe, it } from "node:test";
import assert from "node:assert";
import { OutcomeFinalizerService } from "./outcome-finalizer.service";
import type { SessionEntity } from "../contracts/gateway.types";

const stubSession = { attemptId: "a" } as SessionEntity;

describe("OutcomeFinalizerService", () => {
  it("normalizes final outcome from mock outcome", () => {
    const svc = new OutcomeFinalizerService();
    const o = svc.finalize(stubSession, "price_issue");
    assert.strictEqual(o.outcomeKey, "PRICE_ISSUE");
    assert.strictEqual(o.mockOutcome, "price_issue");
  });
});
