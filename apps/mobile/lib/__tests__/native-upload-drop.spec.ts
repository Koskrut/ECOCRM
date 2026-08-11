const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

/**
 * Documents native upload batch disposition — implemented in NativeSampleUploader.kt.
 * JS flush drops every HTTP-200 batch even when created=0; native must match or Room poisons.
 */
describe("native upload batch disposition (spec mirror)", () => {
  function shouldDropBatch(httpCode, created, duplicate, rejected) {
    if (httpCode === 400 || httpCode === 404) return true;
    if (httpCode >= 200 && httpCode < 300) return true;
    return false;
  }

  function shouldMarkServerAccept(httpCode, created, duplicate) {
    return httpCode >= 200 && httpCode < 300 && (created > 0 || duplicate > 0);
  }

  it("drops HTTP 200 all-rejected batch so queue advances", () => {
    assert.equal(shouldDropBatch(200, 0, 0, 3), true);
    assert.equal(shouldMarkServerAccept(200, 0, 0), false);
  });

  it("accepts HTTP 200 with created or duplicate", () => {
    assert.equal(shouldMarkServerAccept(200, 1, 0), true);
    assert.equal(shouldMarkServerAccept(200, 0, 2), true);
  });

  it("discards dead-shift HTTP 400", () => {
    assert.equal(shouldDropBatch(400, 0, 0, 0), true);
  });

  it("keeps batch on HTTP 401", () => {
    assert.equal(shouldDropBatch(401, 0, 0, 0), false);
  });
});
