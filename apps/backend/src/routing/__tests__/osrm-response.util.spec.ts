import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOsrmCoordinatePath,
  parseOsrmRouteResponse,
} from "../osrm-response.util";

describe("buildOsrmCoordinatePath", () => {
  it("formats lon,lat chain with intermediates", () => {
    const s = buildOsrmCoordinatePath(
      { lat: 50.45, lng: 30.52 },
      [{ lat: 50.46, lng: 30.53 }],
      { lat: 50.47, lng: 30.54 },
    );
    assert.equal(s, "30.52,50.45;30.53,50.46;30.54,50.47");
  });
});

describe("parseOsrmRouteResponse", () => {
  it("parses Ok response with geojson geometry", () => {
    const parsed = parseOsrmRouteResponse({
      code: "Ok",
      routes: [
        {
          distance: 5200,
          duration: 720,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.52, 50.45],
              [30.53, 50.46],
            ],
          },
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.distanceKm, 5.2);
    assert.equal(parsed!.durationMin, 12);
    assert.equal(parsed!.path.length, 2);
    assert.deepEqual(parsed!.path[0], { lat: 50.45, lng: 30.52 });
  });

  it("returns null for non-Ok code", () => {
    assert.equal(parseOsrmRouteResponse({ code: "NoRoute" }), null);
  });
});
