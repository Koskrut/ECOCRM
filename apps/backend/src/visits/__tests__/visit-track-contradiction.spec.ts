import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hasVisitTrackContradiction,
  minDistanceTrackToPinM,
  VISIT_TRACK_APPROACH_M,
} from "../../visits/visit-track-contradiction";

const pin = { lat: 50.45, lng: 30.52 };

describe("visit-track-contradiction", () => {
  it("VISIT_TRACK_APPROACH_M is 1 km", () => {
    assert.equal(VISIT_TRACK_APPROACH_M, 1000);
  });

  it("minDistanceTrackToPinM finds nearest sample", () => {
    const track = [
      { lat: 50.46, lng: 30.53 },
      { lat: 50.4501, lng: 30.5201 },
    ];
    const m = minDistanceTrackToPinM(track, pin);
    assert.ok(m != null && m < 50);
  });

  it("OUTSIDE_RADIUS + track never near pin → contradiction", () => {
    const farTrack = [
      { lat: 50.46, lng: 30.53 },
      { lat: 50.47, lng: 30.54 },
    ];
    assert.equal(
      hasVisitTrackContradiction({
        visits: [{ completeGpsVerification: "OUTSIDE_RADIUS", lat: pin.lat, lng: pin.lng }],
        trackPoints: farTrack,
      }),
      true,
    );
  });

  it("OUTSIDE_RADIUS but track touched pin → no contradiction", () => {
    const approached = [
      { lat: 50.46, lng: 30.53 },
      { lat: 50.4502, lng: 30.5202 },
    ];
    assert.equal(
      hasVisitTrackContradiction({
        visits: [{ completeGpsVerification: "OUTSIDE_RADIUS", lat: pin.lat, lng: pin.lng }],
        trackPoints: approached,
      }),
      false,
    );
  });

  it("VERIFIED visit never triggers contradiction", () => {
    assert.equal(
      hasVisitTrackContradiction({
        visits: [{ completeGpsVerification: "VERIFIED", lat: pin.lat, lng: pin.lng }],
        trackPoints: [],
      }),
      false,
    );
  });
});
