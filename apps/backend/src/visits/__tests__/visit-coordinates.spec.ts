import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectiveVisitLatLng, visitHasRoutableCoordinates } from "../visit-coordinates";

describe("effectiveVisitLatLng", () => {
  it("prefers visit coordinates", () => {
    assert.deepEqual(
      effectiveVisitLatLng({
        lat: 50.1,
        lng: 30.1,
        company: { lat: 51, lng: 31 },
      }),
      { lat: 50.1, lng: 30.1 },
    );
  });

  it("falls back to company for company visits", () => {
    assert.deepEqual(
      effectiveVisitLatLng({
        lat: null,
        lng: null,
        company: { lat: 50.45, lng: 30.52 },
      }),
      { lat: 50.45, lng: 30.52 },
    );
    assert.equal(
      visitHasRoutableCoordinates({ lat: null, lng: null, company: { lat: 1, lng: 2 } }),
      true,
    );
  });

  it("falls back to contact when visit and company lack coords", () => {
    assert.deepEqual(
      effectiveVisitLatLng({
        lat: null,
        lng: null,
        contact: { lat: 48, lng: 35 },
      }),
      { lat: 48, lng: 35 },
    );
  });
});
