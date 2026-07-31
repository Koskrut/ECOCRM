import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { instantToKyivYmd } from "../../crm-timezone";
import { GpsTrackFilterSession, isInUaFieldRegion } from "../gps-sample-filter";

describe("appendSamples shift day (Kyiv)", () => {
  it("shiftDayYmd matches samples on the same Kyiv calendar day as shift.date key", () => {
    const shiftDate = new Date("2026-07-21T00:00:00.000Z");
    const shiftDayYmd = instantToKyivYmd(shiftDate);
    const sampleAt = new Date("2026-07-20T21:00:00.000Z");
    assert.equal(instantToKyivYmd(sampleAt), shiftDayYmd);
    assert.equal(shiftDayYmd, "2026-07-21");
  });

  it("wrong_day when sample calendar day differs from shift.date (Isanchev)", () => {
    const shiftDayYmd = instantToKyivYmd(new Date("2026-07-30T00:00:00.000Z"));
    const sampleAt = new Date("2026-07-31T10:00:00.000Z");
    assert.notEqual(instantToKyivYmd(sampleAt), shiftDayYmd);
  });

  it("session rejects Lima first sample as out_of_region", () => {
    const session = new GpsTrackFilterSession(null);
    const verdict = session.consider({
      lat: -12.04,
      lng: -77.05,
      accuracyM: 20,
      clientRecordedAt: new Date().toISOString(),
    });
    assert.equal(verdict.accept, false);
    assert.equal(verdict.reason, "out_of_region");
    assert.equal(isInUaFieldRegion(-12.04, -77.05), false);
  });
});
