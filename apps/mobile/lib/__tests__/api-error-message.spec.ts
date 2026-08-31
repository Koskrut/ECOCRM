const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { apiErrorMessage } = require("../api-error-message");

describe("apiErrorMessage", () => {
  it("prefers JSON message", () => {
    assert.equal(apiErrorMessage(401, { message: "Missing Authorization header" }), "Missing Authorization header");
  });

  it("joins array messages", () => {
    assert.equal(apiErrorMessage(400, { message: ["a", "b"] }), "a, b");
  });

  it("does not dump HTML pages", () => {
    const html = '<!DOCTYPE html><html lang="uk" style="background-color:#f4f4f5"><head></head></html>';
    assert.equal(apiErrorMessage(404, html), "HTTP 404");
  });

  it("keeps short plain text", () => {
    assert.equal(apiErrorMessage(502, "Backend unreachable"), "Backend unreachable");
  });
});
