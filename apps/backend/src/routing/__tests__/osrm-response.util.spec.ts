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

  it("sums all matchings (Gumenyuk/Mykhailiv: gaps → multiple segments)", () => {
    // Previously only matchings[0] was used → 0.55 km instead of ~15.7.
    const parsed = parseOsrmMatchResponse({
      code: "Ok",
      matchings: [
        {
          distance: 550,
          duration: 120,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.52, 50.45],
              [30.521, 50.451],
            ],
          },
        },
        {
          distance: 40,
          duration: 30,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.53, 50.46],
              [30.531, 50.461],
            ],
          },
        },
        {
          distance: 230,
          duration: 60,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.54, 50.47],
              [30.541, 50.471],
            ],
          },
        },
        {
          distance: 14880,
          duration: 1800,
          geometry: {
            type: "LineString",
            coordinates: [
              [30.55, 50.48],
              [30.56, 50.49],
              [30.57, 50.5],
            ],
          },
        },
      ],
    });
    assert.ok(parsed);
    assert.equal(parsed!.distanceKm, 15.7);
    assert.equal(parsed!.durationMin, 34);
    assert.equal(parsed!.path.length, 9);
  });

  it("returns null for NoMatch", () => {
    assert.equal(parseOsrmMatchResponse({ code: "NoMatch" }), null);
  });

  it("returns null when matchings empty", () => {
    assert.equal(parseOsrmMatchResponse({ code: "Ok", matchings: [] }), null);
  });
});
