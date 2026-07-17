import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOsrmCoordinatePath,
  buildOsrmTraceCoordinatePath,
  parseOsrmMatchResponse,
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

describe("buildOsrmTraceCoordinatePath", () => {
  it("formats GPS trace coordinates", () => {
    const s = buildOsrmTraceCoordinatePath([
      { lat: 50.45, lng: 30.52 },
      { lat: 50.46, lng: 30.53 },
    ]);
    assert.equal(s, "30.52,50.45;30.53,50.46");
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

describe("parseOsrmMatchResponse", () => {
  it("parses Ok matchings with geojson geometry", () => {
    const parsed = parseOsrmMatchResponse({
      code: "Ok",
      matchings: [
        {
          distance: 3100,
          duration: 480,
          confidence: 0.9,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.52, 50.45],
              [30.525, 50.455],
              [30.53, 50.46],
            ],
          },
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.distanceKm, 3.1);
    assert.equal(parsed!.durationMin, 8);
    assert.equal(parsed!.path.length, 3);
  });

  it("returns null for NoMatch", () => {
    assert.equal(parseOsrmMatchResponse({ code: "NoMatch" }), null);
  });

  it("returns null when matchings empty", () => {
    assert.equal(parseOsrmMatchResponse({ code: "Ok", matchings: [] }), null);
  });
});
