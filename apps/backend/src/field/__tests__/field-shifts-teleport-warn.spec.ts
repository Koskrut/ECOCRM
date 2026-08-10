import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatAppendSamplesTeleportWarn } from "../field-shifts.service";

describe("formatAppendSamplesTeleportWarn", () => {
  it("includes prev, candidate, gapMin and implied speed", () => {
    const prevAt = new Date("2026-08-08T10:00:00.000Z");
    const candidateAt = new Date("2026-08-08T10:06:00.000Z");
    const line = formatAppendSamplesTeleportWarn({
      shiftId: "shift-1",
      ownerId: "user-1",
      prev: { lat: 48.39, lng: 35.01, clientRecordedAt: prevAt },
      candidate: {
        lat: 48.5,
        lng: 35.1,
        accuracyM: 20,
        clientRecordedAt: candidateAt,
      },
    });

    assert.match(line, /appendSamples teleport/);
    assert.match(line, /prev=48\.39,35\.01/);
    assert.match(line, /candidate=48\.5,35\.1/);
    assert.match(line, /gapMin=6\.0/);
    assert.match(line, /speedKmh=/);
  });

  it("handles missing prev", () => {
    const line = formatAppendSamplesTeleportWarn({
      shiftId: "s",
      ownerId: "u",
      prev: null,
      candidate: {
        lat: 48.39,
        lng: 35.01,
        clientRecordedAt: new Date(),
      },
    });
    assert.match(line, /prev=null/);
    assert.match(line, /gapMin=\?/);
  });
});
