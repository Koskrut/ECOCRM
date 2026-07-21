const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { apiBaseUrlCandidates, normalizeApiBaseUrl } = require("../api-url");

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

  it("keeps /api path", () => {
    assert.equal(
      normalizeApiBaseUrl("https://crm.example.com/api/"),
      "https://crm.example.com/api",
    );
  });
});

describe("apiBaseUrlCandidates", () => {
  it("adds /api when path is empty", () => {
    assert.deepEqual(apiBaseUrlCandidates("https://crm.example.com"), [
      "https://crm.example.com",
      "https://crm.example.com/api",
    ]);
  });

  it("does not duplicate when /api already set", () => {
    assert.deepEqual(apiBaseUrlCandidates("https://crm.example.com/api"), [
      "https://crm.example.com/api",
    ]);
  });

  it("does not alter direct API hosts with port", () => {
    assert.deepEqual(apiBaseUrlCandidates("http://10.0.2.2:3001"), [
      "http://10.0.2.2:3001",
      "http://10.0.2.2:3001/api",
    ]);
  });
});
