import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RouteResultCache } from "../route-result-cache";

describe("RouteResultCache", () => {
  it("stores and returns values within TTL", () => {
    const cache = new RouteResultCache<string>(60_000);
    cache.set("a", "value");
    assert.equal(cache.get("a"), "value");
  });

  it("expires entries after TTL", async () => {
    const cache = new RouteResultCache<string>(20);
    cache.set("a", "value");
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(cache.get("a"), undefined);
  });
});
