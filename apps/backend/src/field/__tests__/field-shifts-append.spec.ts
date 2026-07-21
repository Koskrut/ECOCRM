import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instantToKyivYmd } from "../../crm-timezone";

describe("appendSamples shift day (Kyiv)", () => {
  it("shiftDayYmd matches samples on the same Kyiv calendar day as shift.date key", () => {
    const shiftDate = new Date("2026-07-21T00:00:00.000Z");
    const shiftDayYmd = instantToKyivYmd(shiftDate);
    const sampleAt = new Date("2026-07-20T21:00:00.000Z");
    assert.equal(instantToKyivYmd(sampleAt), shiftDayYmd);
    assert.equal(shiftDayYmd, "2026-07-21");
  });
});
