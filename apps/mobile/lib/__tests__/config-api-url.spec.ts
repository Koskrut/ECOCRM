const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { normalizeApiBaseUrl } = require("../api-url");

describe("normalizeApiBaseUrl", () => {
  it("adds https when scheme is missing", () => {
    assert.equal(normalizeApiBaseUrl("api.example.com"), "https://api.example.com");
  });

  it("keeps http for LAN", () => {
    assert.equal(normalizeApiBaseUrl("http://10.0.2.2:3001"), "http://10.0.2.2:3001");
  });

  it("strips trailing slash", () => {
    assert.equal(normalizeApiBaseUrl("https://api.example.com/"), "https://api.example.com");
  });

  it("rejects empty", () => {
    assert.throws(() => normalizeApiBaseUrl("   "), /empty/);
  });
});
