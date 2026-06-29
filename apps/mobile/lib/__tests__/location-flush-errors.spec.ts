const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  classifyFlushHttpStatus,
  classifyFlushThrownError,
} = require("../location-flush-errors");

describe("classifyFlushHttpStatus", () => {
  it("retries on 5xx", () => {
    assert.equal(classifyFlushHttpStatus(500), "retry");
    assert.equal(classifyFlushHttpStatus(503), "retry");
  });

  it("discards all on 401 and 404", () => {
    assert.equal(classifyFlushHttpStatus(401), "discard_all");
    assert.equal(classifyFlushHttpStatus(404), "discard_all");
  });

  it("discards batch on other 4xx", () => {
    assert.equal(classifyFlushHttpStatus(400), "discard_batch");
    assert.equal(classifyFlushHttpStatus(403), "discard_batch");
  });

  it("retries on 408 and 429", () => {
    assert.equal(classifyFlushHttpStatus(408), "retry");
    assert.equal(classifyFlushHttpStatus(429), "retry");
  });
});

describe("classifyFlushThrownError", () => {
  it("always retries network errors", () => {
    assert.equal(classifyFlushThrownError(), "retry");
  });
});
