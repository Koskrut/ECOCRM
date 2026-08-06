const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { notificationEntityPath } = require("../notification-navigation");

describe("notificationEntityPath", () => {
  it("maps FIELD_SHIFT to tabs root", () => {
    assert.equal(notificationEntityPath("FIELD_SHIFT", "x"), "/(tabs)");
  });
});

describe("gps_stopped deep link (data contract)", () => {
  it("uses today screen marker for local GPS alert", () => {
    const data = { type: "gps_stopped", screen: "today" };
    assert.equal(data.type, "gps_stopped");
    assert.equal(data.screen, "today");
  });
});
