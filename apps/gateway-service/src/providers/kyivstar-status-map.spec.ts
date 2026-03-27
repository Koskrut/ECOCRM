import { describe, it } from "node:test";
import assert from "node:assert";
import { extractStatusString, mapProviderStatusToTelephony } from "./kyivstar-status-map";

describe("mapProviderStatusToTelephony", () => {
  it("maps common provider labels", () => {
    assert.deepStrictEqual(mapProviderStatusToTelephony("RINGING"), { status: "ringing" });
    assert.deepStrictEqual(mapProviderStatusToTelephony("answered"), { status: "answered" });
    assert.deepStrictEqual(mapProviderStatusToTelephony("completed"), { status: "completed" });
    assert.deepStrictEqual(mapProviderStatusToTelephony("failed"), {
      status: "failed",
      reason: "failed",
    });
  });

  it("returns null for unknown raw status", () => {
    assert.strictEqual(mapProviderStatusToTelephony("weird_unknown_xyz"), null);
  });
});

describe("extractStatusString", () => {
  it("reads nested call.status", () => {
    assert.strictEqual(extractStatusString({ call: { status: "ringing" } }), "ringing");
  });
});
