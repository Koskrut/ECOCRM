const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  isRecoveryPass,
  isRecoveryFailed,
  deriveRecoveryStateFromHealth,
  newRecoveryAttemptId,
} = require("../tracking-recovery-state");

describe("isRecoveryPass", () => {
  it("passes only when new accept is after recoveryStartedAt", () => {
    const started = "2026-08-10T10:00:00.000Z";
    assert.equal(isRecoveryPass(started, "2026-08-10T10:05:00.000Z"), true);
    assert.equal(isRecoveryPass(started, "2026-08-10T09:59:00.000Z"), false);
    assert.equal(isRecoveryPass(started, null), false);
  });
});

describe("isRecoveryFailed", () => {
  it("fails when task started but no new accept after recovery", () => {
    const started = "2026-08-10T10:00:00.000Z";
    const oldAccept = "2026-08-10T09:00:00.000Z";
    assert.equal(isRecoveryFailed(true, started, oldAccept), true);
    assert.equal(isRecoveryFailed(true, started, "2026-08-10T10:01:00.000Z"), false);
    assert.equal(isRecoveryFailed(false, started, oldAccept), false);
  });

  it("poison recreate: taskStarted true, acceptReceived false → RECOVERY_FAILED", () => {
    const recoveryStartedAt = "2026-08-10T10:00:00.000Z";
    const previousAccept = "2026-08-10T08:00:00.000Z";
    assert.equal(isRecoveryFailed(true, recoveryStartedAt, previousAccept), true);
  });
});

describe("deriveRecoveryStateFromHealth", () => {
  it("maps zombie FGS from health bits", () => {
    assert.equal(
      deriveRecoveryStateFromHealth({
        taskRegistered: true,
        acceptStale: true,
        zombieFgs: true,
        taskDead: false,
        recoveryRequired: false,
        recoveryInProgress: false,
        recoveryPass: false,
        recoveryFailed: false,
      }),
      "ZOMBIE_FGS",
    );
  });

  it("maps RECOVERED when recovery pass", () => {
    assert.equal(
      deriveRecoveryStateFromHealth({
        taskRegistered: true,
        acceptStale: false,
        zombieFgs: false,
        taskDead: false,
        recoveryRequired: false,
        recoveryInProgress: false,
        recoveryPass: true,
        recoveryFailed: false,
      }),
      "RECOVERED",
    );
  });
});

describe("newRecoveryAttemptId", () => {
  it("generates unique attempt ids", () => {
    const a = newRecoveryAttemptId(1000);
    const b = newRecoveryAttemptId(1000);
    assert.notEqual(a, b);
    assert.match(a, /^rec_1000_/);
  });
});
