import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decodeEncodedPolyline, pathFromWaypoints } from "../polyline.util";

describe("polyline.util", () => {
  it("decodeEncodedPolyline decodes known sample", () => {
    // Encodes ~ (38.5, -120.2) -> (40.7, -120.95) simplified Google example fragment
    const points = decodeEncodedPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    assert.ok(points.length >= 2);
    assert.ok(typeof points[0]!.lat === "number");
    assert.ok(typeof points[0]!.lng === "number");
  });

  it("pathFromWaypoints chains unique points", () => {
    const path = pathFromWaypoints(
      { lat: 50, lng: 30 },
      [{ lat: 50.1, lng: 30.1 }],
      { lat: 50.2, lng: 30.2 },
    );
    assert.equal(path.length, 3);
  });
});
