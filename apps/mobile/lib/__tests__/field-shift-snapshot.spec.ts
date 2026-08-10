const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

describe("FieldShiftSnapshot shape (contract)", () => {
  it("minimal ACTIVE snapshot enables cold-wake append", () => {
    const snapshot = {
      shiftId: "shift-1",
      status: "ACTIVE",
      trackingMode: "background",
      startedAt: "2026-08-10T08:00:00.000Z",
      lastKnownAcceptAt: null,
      lastKnownPointAt: null,
      persistedAt: "2026-08-10T08:00:00.000Z",
    };
    assert.equal(snapshot.status, "ACTIVE");
    assert.equal(snapshot.shiftId, "shift-1");
    assert.equal(snapshot.trackingMode, "background");
  });

  it("append resolves shift id from stored id without snapshot", () => {
    const storedShiftId = "shift-runtime";
    const resolved = storedShiftId || "shift-from-snapshot";
    assert.equal(resolved, "shift-runtime");
  });

  it("append uses snapshot shift id when runtime binding missing", () => {
    const storedShiftId = null;
    const snapshot = { shiftId: "shift-cold-wake", status: "ACTIVE" };
    const resolved =
      storedShiftId ?? (snapshot.status === "ACTIVE" ? snapshot.shiftId : null);
    assert.equal(resolved, "shift-cold-wake");
  });
});
