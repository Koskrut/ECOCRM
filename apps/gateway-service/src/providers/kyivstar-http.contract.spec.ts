import { describe, it } from "node:test";
import assert from "node:assert";
import { extractOutboundCallId } from "./kyivstar-http";
import { extractStatusString, mapProviderStatusToTelephony } from "./kyivstar-status-map";

describe("extractOutboundCallId contract variants", () => {
  it("reads nested result.callId", () => {
    const r = extractOutboundCallId({ result: { callId: "c1" } });
    assert.strictEqual(r?.callId, "c1");
  });

  it("reads numeric id", () => {
    const r = extractOutboundCallId({ id: 99001 });
    assert.strictEqual(r?.callId, "99001");
  });

  it("reads data.payload nested", () => {
    const r = extractOutboundCallId({ data: { payload: { uuid: "u-1" } } });
    assert.strictEqual(r?.callId, "u-1");
  });
});

describe("extractStatusString nested", () => {
  it("reads data.call.status", () => {
    assert.strictEqual(extractStatusString({ data: { call: { status: "RINGING" } } }), "RINGING");
  });

  it("reads phase at top level", () => {
    assert.strictEqual(extractStatusString({ phase: "answered" }), "answered");
  });
});

describe("unknown status mapping stays safe", () => {
  it("returns null for unmapped label", () => {
    assert.strictEqual(mapProviderStatusToTelephony("vendor_custom_xyz_99"), null);
  });
});
