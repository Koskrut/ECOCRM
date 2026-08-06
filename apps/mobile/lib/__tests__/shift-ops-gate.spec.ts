const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  canRunShiftOperation,
  shouldReuseActiveShift,
  shouldOfferRestartShiftCta,
  shouldDeferAdaptiveTierApply,
  shouldForceRecreateBackgroundTask,
} = require("../shift-ops-gate");

describe("canRunShiftOperation", () => {
  it("blocks overlapping ops (Smoke thrash)", () => {
    assert.equal(canRunShiftOperation(false), true);
    assert.equal(canRunShiftOperation(true), false);
  });
});

describe("shouldReuseActiveShift", () => {
  it("reuses ACTIVE and rejects ended/null", () => {
    assert.equal(shouldReuseActiveShift("ACTIVE"), true);
    assert.equal(shouldReuseActiveShift("ENDED"), false);
    assert.equal(shouldReuseActiveShift(null), false);
  });
});

describe("shouldOfferRestartShiftCta", () => {
  it("only offers end+start for wrong_day — not dead FGS", () => {
    assert.equal(shouldOfferRestartShiftCta("accept_stale_wrong_day"), true);
    assert.equal(shouldOfferRestartShiftCta("background_task_dead"), false);
    assert.equal(shouldOfferRestartShiftCta("accept_stale"), false);
    assert.equal(shouldOfferRestartShiftCta("none"), false);
  });
});

describe("shouldDeferAdaptiveTierApply", () => {
  it("defers tier stop+start while background (pending only)", () => {
    assert.equal(shouldDeferAdaptiveTierApply("background"), true);
    assert.equal(shouldDeferAdaptiveTierApply("inactive"), true);
    assert.equal(shouldDeferAdaptiveTierApply("active"), false);
  });
});

describe("shouldForceRecreateBackgroundTask", () => {
  it("recreates when dead or poison FGS on foreground", () => {
    assert.equal(
      shouldForceRecreateBackgroundTask({
        claimedMode: "background",
        taskStarted: false,
        acceptStale: false,
        appState: "active",
      }),
      true,
    );
    assert.equal(
      shouldForceRecreateBackgroundTask({
        claimedMode: "background",
        taskStarted: true,
        acceptStale: true,
        appState: "active",
      }),
      true,
    );
  });

  it("never recreates from background AppState", () => {
    assert.equal(
      shouldForceRecreateBackgroundTask({
        claimedMode: "background",
        taskStarted: false,
        acceptStale: true,
        appState: "background",
      }),
      false,
    );
  });

  it("skips healthy running task", () => {
    assert.equal(
      shouldForceRecreateBackgroundTask({
        claimedMode: "background",
        taskStarted: true,
        acceptStale: false,
        appState: "active",
      }),
      false,
    );
  });
});
