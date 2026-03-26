import { describe, it } from "node:test";
import assert from "node:assert";
import { assertTransition, canTransition } from "./session-state-machine";

describe("session-state-machine", () => {
  it("allows queued -> starting", () => {
    assert.strictEqual(canTransition("queued", "starting"), true);
    assert.doesNotThrow(() => assertTransition("queued", "starting", "orchestrator_start"));
  });

  it("rejects queued -> answered", () => {
    assert.strictEqual(canTransition("queued", "answered"), false);
    assert.throws(() => assertTransition("queued", "answered", "telephony_answered"));
  });

  it("allows full happy path chain", () => {
    assertTransition("queued", "starting", "orchestrator_start");
    assertTransition("starting", "ringing", "telephony_ringing");
    assertTransition("ringing", "answered", "telephony_answered");
    assertTransition("answered", "ai_active", "ai_started");
    assertTransition("ai_active", "completed", "complete");
  });

  it("allows transferred path", () => {
    assertTransition("ai_active", "transfer_requested", "transfer_requested");
    assertTransition("transfer_requested", "transferred", "transferred");
    assertTransition("transferred", "completed", "complete");
  });
});
