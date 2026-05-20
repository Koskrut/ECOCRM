import { describe, it } from "node:test";
import assert from "node:assert";
import { CallStoreService } from "./call-store.service";

describe("CallStoreService", () => {
  it("creates and updates call status", () => {
    const store = new CallStoreService();
    const r = store.create({
      externalSessionId: "e1",
      attemptId: "a1",
      destination: "+380501112233",
    });
    assert.ok(r.callId);
    store.setStatus(r.callId, "answered");
    assert.strictEqual(store.get(r.callId)?.status, "answered");
  });
});
