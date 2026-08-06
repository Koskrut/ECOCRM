const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  classifySampleRejectBatch,
  describeRejectBatch,
  formatRejectReasons,
  isWrongDayBatch,
  softRejectCountsAsAccept,
} = require("../location-sample-reject");

describe("classifySampleRejectBatch", () => {
  it("treats duplicate-only as soft (Mykhailiv — not ERROR)", () => {
    assert.equal(classifySampleRejectBatch({ duplicate: 3 }), "soft");
  });

  it("treats bad_accuracy as hard", () => {
    assert.equal(classifySampleRejectBatch({ bad_accuracy: 2 }), "hard");
  });

  it("treats wrong_day as hard", () => {
    assert.equal(classifySampleRejectBatch({ wrong_day: 1 }), "hard");
  });

  it("treats out_of_region as hard", () => {
    assert.equal(classifySampleRejectBatch({ out_of_region: 5 }), "hard");
  });

  it("treats invalid_coords as hard", () => {
    assert.equal(classifySampleRejectBatch({ invalid_coords: 2 }), "hard");
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

  it("treats unrecognized server reasons as unknown (not soft/healthy)", () => {
    assert.equal(classifySampleRejectBatch({ mysterious: 2 }), "unknown");
  });
});

describe("isWrongDayBatch", () => {
  it("detects Isanchev wrong_day-dominated flush", () => {
    assert.equal(isWrongDayBatch({ wrong_day: 40 }, 40), true);
  });

  it("purges when wrong_day is majority even with stray duplicates", () => {
    assert.equal(isWrongDayBatch({ wrong_day: 30, duplicate: 10 }, 40), true);
  });

  it("ignores mixed batches with few wrong_day", () => {
    assert.equal(isWrongDayBatch({ wrong_day: 1, duplicate: 20 }, 21), false);
  });

  it("treats exactly 50% wrong_day as purge candidate", () => {
    assert.equal(isWrongDayBatch({ wrong_day: 10, duplicate: 10 }, 20), true);
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

describe("describeRejectBatch", () => {
  it("humanizes duplicate as keepalive OK", () => {
    assert.match(describeRejectBatch({ duplicate: 3 }), /duplicate.*keepalive OK/i);
  });

  it("humanizes teleport after gap", () => {
    assert.match(describeRejectBatch({ teleport: 1 }), /teleport after gap/i);
  });
});

describe("softRejectCountsAsAccept", () => {
  it("duplicate-only does NOT count as accept (must not mask stale)", () => {
    assert.equal(softRejectCountsAsAccept({ duplicate: 5 }), false);
  });

  it("legacy keepalive soft reject counts as accept", () => {
    assert.equal(softRejectCountsAsAccept({ keepalive: 1 }), true);
    assert.equal(softRejectCountsAsAccept({ keepalive: 1, duplicate: 2 }), true);
  });

  it("hard reasons never count as accept", () => {
    assert.equal(softRejectCountsAsAccept({ keepalive: 1, wrong_day: 1 }), false);
  });
});
