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

  it("parseKyivstarCallHistoryPayload reads lowercase calls (live API)", () => {
    const calls = parseKyivstarCallHistoryPayload({
      calls: [{ call_id: "xyz", record_id: "rec-1", direction: "outgoing" }],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.call_id, "xyz");
    assert.equal(calls[0]?.record_id, "rec-1");
  });

  it("parseKyivstarCallHistoryPayload prefers lowercase calls when both present", () => {
    const calls = parseKyivstarCallHistoryPayload({
      calls: [{ call_id: "lower" }],
      Calls: [{ call_id: "upper" }],
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.call_id, "lower");
  });

  it("formatKyivstarFmcQueryDatetime produces ISO-like local string", () => {
    const s = formatKyivstarFmcQueryDatetime(new Date("2023-12-01T10:00:00.000Z"));
    assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    const hour = Number(s.slice(11, 13));
    assert.ok(hour >= 0 && hour <= 23, `hour must be 0-23, got ${hour}`);
  });

  it("formatKyivstarFmcQueryDatetime never emits hour 24 around Kyiv midnight", () => {
    // Sweep 48h around a Kyiv midnight transition (UTC summer offset +3).
    for (let i = 0; i < 48 * 4; i += 1) {
      const d = new Date(Date.UTC(2026, 6, 21, 18, 0, 0) + i * 15 * 60_000);
      const s = formatKyivstarFmcQueryDatetime(d);
      assert.match(s, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      const hour = Number(s.slice(11, 13));
      assert.ok(hour >= 0 && hour <= 23, `got ${s} for ${d.toISOString()}`);
    }
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
