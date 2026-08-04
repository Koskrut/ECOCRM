const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  isWrongDayBatch,
  softRejectCountsAsAccept,
  classifySampleRejectBatch,
} = require("../location-sample-reject");
const {
  reconcileTrackingHealth,
  isAcceptStale,
  LAST_ACCEPT_STALE_MS,
} = require("../location-tracking-health");

/**
 * Pure decision mirror of flushPendingSamples wrong_day / healthy paths
 * (AsyncStorage flush is integration-tested via these predicates).
 */
function shouldPurgeWrongDayAndMarkStale(
  created: number,
  rejected: number,
  rejectReasons: Record<string, number>,
) {
  return created === 0 && isWrongDayBatch(rejectReasons, rejected);
}

function shouldRefreshAcceptAfterSoftReject(created: number, rejectReasons: Record<string, number>) {
  if (created > 0) return true;
  return softRejectCountsAsAccept(rejectReasons);
}

describe("wrong_day buffer purge decision", () => {
  it("purges Isanchev wrong_day-dominated batch (no forever retry)", () => {
    assert.equal(shouldPurgeWrongDayAndMarkStale(0, 40, { wrong_day: 40 }), true);
  });

  it("does not purge when some samples were accepted", () => {
    assert.equal(shouldPurgeWrongDayAndMarkStale(2, 10, { wrong_day: 10 }), false);
  });

  it("does not purge duplicate-only (Mykhailiv)", () => {
    assert.equal(shouldPurgeWrongDayAndMarkStale(0, 5, { duplicate: 5 }), false);
    assert.equal(classifySampleRejectBatch({ duplicate: 5 }), "soft");
  });
});

describe("honest healthy derivation", () => {
  it("ACTIVE + null accept → stale", () => {
    assert.equal(isAcceptStale(null), true);
    const h = reconcileTrackingHealth("background", true, false, {
      lastAcceptedAt: null,
      requireRecentAccept: true,
    });
    assert.equal(h.healthy, false);
    assert.equal(h.acceptStale, true);
  });

  it("duplicate soft reject must NOT count as accept", () => {
    assert.equal(shouldRefreshAcceptAfterSoftReject(0, { duplicate: 3 }), false);
  });

  it("created>0 refreshes accept (keepalive is server accept)", () => {
    assert.equal(shouldRefreshAcceptAfterSoftReject(1, { duplicate: 2 }), true);
  });

  it("accept older than 10 min → stale", () => {
    const now = Date.now();
    assert.equal(
      isAcceptStale(new Date(now - LAST_ACCEPT_STALE_MS - 1000).toISOString(), now),
      true,
    );
  });
});
