import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractClientIp, resolveIpGeo } from "../ip-geo.util";

describe("presence ip-geo", () => {
  it("extracts first forwarded IP", () => {
    const ip = extractClientIp({
      ip: "10.0.0.1",
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1" },
    });
    assert.equal(ip, "203.0.113.10");
  });

  it("normalizes ipv4-mapped ipv6", () => {
    const ip = extractClientIp({ ip: "::ffff:192.168.1.1", headers: {} });
    assert.equal(ip, "192.168.1.1");
  });

  it("returns null geo for missing ip", () => {
    const geo = resolveIpGeo(null);
    assert.deepEqual(geo, { city: null, region: null, country: null });
  });
});
