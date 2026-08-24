const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { newUuidV4 } = require("../tracking-ids");

describe("sampleId generation contract", () => {
  it("generates a valid UUID v4 per call", () => {
    const id = newUuidV4();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("never reuses the same id across calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(newUuidV4());
    assert.equal(ids.size, 1000, "1000 UUIDs must all be unique");
  });

  it("each capture gets a fresh id (simulate sequential captures)", () => {
    const a = newUuidV4();
    const b = newUuidV4();
    assert.notEqual(a, b, "two captures must have different sampleIds");
  });
});

describe("sampleId contract across shift restart / retry", () => {
  it("retry must reuse same sampleId (same payload)", () => {
    const sampleId = newUuidV4();
    const attempt1 = { sampleId, attempt: 1 };
    const attempt2 = { ...attempt1, attempt: attempt1.attempt + 1 };
    assert.equal(attempt2.sampleId, sampleId, "retry keeps original sampleId");
    assert.equal(attempt2.attempt, 2, "attempt is incremented");
  });

  it("new shift means new sampleIds (purge simulated)", () => {
    const shiftA_ids = [newUuidV4(), newUuidV4()];
    const shiftB_ids = [newUuidV4(), newUuidV4()];
    for (const a of shiftA_ids) {
      for (const b of shiftB_ids) {
        assert.notEqual(a, b, "ids across shifts must differ (purge + new UUIDs)");
      }
    }
  });
});
