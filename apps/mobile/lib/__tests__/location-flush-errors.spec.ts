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

  it("enqueues offline on 401 (does not wipe pending)", () => {
    assert.equal(classifyFlushHttpStatus(401), "enqueue_offline");
  });

  it("discards all on 404", () => {
    assert.equal(classifyFlushHttpStatus(404), "discard_all");
  });

  it("discards batch on 400 (dead shift)", () => {
    assert.equal(classifyFlushHttpStatus(400), "discard_batch");
  });

  it("enqueues offline on other 4xx", () => {
    assert.equal(classifyFlushHttpStatus(403), "enqueue_offline");
  });

  it("retries on 408 and 429", () => {
    assert.equal(classifyFlushHttpStatus(408), "retry");
    assert.equal(classifyFlushHttpStatus(429), "retry");
  });
});

describe("classifyFlushThrownError", () => {
  it("enqueues offline on network errors", () => {
    assert.equal(classifyFlushThrownError(), "enqueue_offline");
  });
});
