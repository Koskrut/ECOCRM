const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  shouldSendGpsStoppedNotification,
  GPS_STOPPED_NOTIFY_COOLDOWN_MS,
} = require("../location-tracking-alerts-logic");

describe("shouldSendGpsStoppedNotification", () => {
  it("fires when background mode but FGS dead", () => {
    assert.equal(
      shouldSendGpsStoppedNotification("background", false, null, 1_000_000, "task_dead"),
      true,
    );
  });

  it("does not fire task_dead when task is running", () => {
    assert.equal(
      shouldSendGpsStoppedNotification("background", true, null, 1_000_000, "task_dead"),
      false,
    );
  });

  it("fires zombie_fgs when task is running but accept pipeline stale", () => {
    assert.equal(
      shouldSendGpsStoppedNotification("background", true, null, 1_000_000, "zombie_fgs"),
      true,
    );
  });

  it("does not fire zombie when task is not running", () => {
    assert.equal(
      shouldSendGpsStoppedNotification("background", false, null, 1_000_000, "zombie_fgs"),
      false,
    );
  });

  it("respects cooldown dedupe", () => {
    const now = 1_000_000;
    assert.equal(
      shouldSendGpsStoppedNotification(
        "background",
        false,
        now - GPS_STOPPED_NOTIFY_COOLDOWN_MS + 1000,
        now,
        "task_dead",
      ),
      false,
    );
  });

  it("ignores non-background modes", () => {
    assert.equal(shouldSendGpsStoppedNotification("foreground", false, null, 0, "task_dead"), false);
    assert.equal(shouldSendGpsStoppedNotification("none", false, null, 0, "task_dead"), false);
  });
});
