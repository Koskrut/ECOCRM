const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  classifySampleRejectBatch,
  formatRejectReasons,
} = require("../location-sample-reject");

describe("classifySampleRejectBatch", () => {
  it("treats duplicate-only as soft", () => {
    assert.equal(classifySampleRejectBatch({ duplicate: 3 }), "soft");
  });

  it("treats bad_accuracy as hard", () => {
    assert.equal(classifySampleRejectBatch({ bad_accuracy: 2 }), "hard");
  });

  it("treats wrong_day as hard", () => {
    assert.equal(classifySampleRejectBatch({ wrong_day: 1 }), "hard");
  });

  it("treats teleport as hard", () => {
    assert.equal(classifySampleRejectBatch({ teleport: 1 }), "hard");
  });

  it("treats mixed hard+soft as hard", () => {
    assert.equal(classifySampleRejectBatch({ duplicate: 2, bad_accuracy: 1 }), "hard");
  });

  it("returns unknown when reasons missing", () => {
    assert.equal(classifySampleRejectBatch(undefined), "unknown");
    assert.equal(classifySampleRejectBatch(null), "unknown");
    assert.equal(classifySampleRejectBatch({}), "unknown");
  });
});

describe("formatRejectReasons", () => {
  it("stringifies reason counts", () => {
    assert.equal(formatRejectReasons({ duplicate: 2 }), '{"duplicate":2}');
  });

  it("falls back to empty object", () => {
    assert.equal(formatRejectReasons(undefined), "{}");
  });
});
