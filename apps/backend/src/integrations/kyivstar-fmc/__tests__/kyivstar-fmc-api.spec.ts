import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatKyivstarFmcQueryDatetime,
  parseKyivstarCallHistoryPayload,
} from "../kyivstar-fmc-api";

describe("kyivstar-fmc-api", () => {
  it("parseKyivstarCallHistoryPayload reads Calls array", () => {
    const calls = parseKyivstarCallHistoryPayload({
      Calls: [{ call_id: "abc", direction: "incoming" }],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.call_id, "abc");
  });

  it("formatKyivstarFmcQueryDatetime produces ISO-like local string", () => {
    const s = formatKyivstarFmcQueryDatetime(new Date("2023-12-01T10:00:00.000Z"));
    assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
  });
});

describe("postKyivstarOriginate parsing", () => {
  it("extracts call_control_id from JSON body", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(JSON.stringify({ call_control_id: "ctrl-123" }), { status: 200 });
    try {
      const { postKyivstarOriginate } = await import("../kyivstar-fmc-api");
      const res = await postKyivstarOriginate(
        { fmcToken: "t", integratorId: "i" },
        "+380501111111",
        "+380501234567",
      );
      assert.equal(res.ok, true);
      if (res.ok) assert.equal(res.callControlId, "ctrl-123");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
