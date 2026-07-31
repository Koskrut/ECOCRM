const assert = require("node:assert/strict");
const { describe, it, beforeEach } = require("node:test");

const {
  isAuthRequired,
  setAuthRequired,
  getLastFlushBlockReason,
  setFlushBlockReason,
  clearFlushBlockReason,
} = require("../session-auth");

describe("session-auth flags", () => {
  beforeEach(() => {
    setAuthRequired(false, null);
    clearFlushBlockReason();
  });

  it("auth_required sets block reason and isAuthRequired", () => {
    setAuthRequired(true, "auth_401");
    assert.equal(isAuthRequired(), true);
    assert.equal(getLastFlushBlockReason(), "auth_401");
  });

  it("clearing auth_required clears auth block", () => {
    setAuthRequired(true, "auth_401");
    setAuthRequired(false, null);
    assert.equal(isAuthRequired(), false);
    assert.equal(getLastFlushBlockReason(), null);
  });

  it("wrong_day block is independent of auth flag", () => {
    setFlushBlockReason("wrong_day");
    assert.equal(isAuthRequired(), false);
    assert.equal(getLastFlushBlockReason(), "wrong_day");
    clearFlushBlockReason();
    assert.equal(getLastFlushBlockReason(), null);
  });
});
