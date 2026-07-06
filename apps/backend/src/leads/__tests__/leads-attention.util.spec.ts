import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildLeadAttentionWhere } from "../leads-attention.util";

describe("leads-attention.util", () => {
  it("never-contacted-new requires NEW and no activities", () => {
    const where = buildLeadAttentionWhere("never-contacted-new", "month");
    assert.equal(where.status, "NEW");
    assert.deepEqual(where.activities, { none: {} });
  });

  it("without-touch is OR of new and in-progress branches", () => {
    const where = buildLeadAttentionWhere("without-touch", "month");
    assert.ok(Array.isArray(where.OR));
    assert.equal(where.OR?.length, 2);
  });

  it("stale-in-progress filters IN_PROGRESS without recent activity", () => {
    const where = buildLeadAttentionWhere("stale-in-progress", "month");
    assert.equal(where.status, "IN_PROGRESS");
    assert.ok(where.NOT);
  });
});
