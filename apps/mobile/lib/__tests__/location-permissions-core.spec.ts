const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  resolveBackgroundPermissionStatus,
  isBackgroundLocationGrantedStatus,
  shouldSkipBackgroundPermissionPrompt,
} = require("../location-permissions-core");

describe("resolveBackgroundPermissionStatus", () => {
  it("keeps expo granted regardless of native", () => {
    assert.equal(resolveBackgroundPermissionStatus("granted", null), "granted");
    assert.equal(resolveBackgroundPermissionStatus("granted", false), "granted");
    assert.equal(resolveBackgroundPermissionStatus("granted", true), "granted");
  });

  it("upgrades expo false-negatives when native ContextCompat says granted", () => {
    assert.equal(resolveBackgroundPermissionStatus("undetermined", true), "granted");
    assert.equal(resolveBackgroundPermissionStatus("denied", true), "granted");
    assert.equal(resolveBackgroundPermissionStatus(null, true), "granted");
  });

  it("leaves expo status when native is unavailable or denied", () => {
    assert.equal(resolveBackgroundPermissionStatus("undetermined", null), "undetermined");
    assert.equal(resolveBackgroundPermissionStatus("denied", null), "denied");
    assert.equal(resolveBackgroundPermissionStatus("denied", false), "denied");
    assert.equal(resolveBackgroundPermissionStatus(null, null), null);
    assert.equal(resolveBackgroundPermissionStatus(null, false), null);
  });
});

describe("isBackgroundLocationGrantedStatus / shouldSkipBackgroundPermissionPrompt", () => {
  it("only treats exact granted as Always", () => {
    assert.equal(isBackgroundLocationGrantedStatus("granted"), true);
    assert.equal(isBackgroundLocationGrantedStatus("denied"), false);
    assert.equal(isBackgroundLocationGrantedStatus("undetermined"), false);
    assert.equal(isBackgroundLocationGrantedStatus(null), false);
  });

  it("skips Always dialog when native already granted", () => {
    assert.equal(shouldSkipBackgroundPermissionPrompt("undetermined", true), true);
    assert.equal(shouldSkipBackgroundPermissionPrompt("denied", true), true);
    assert.equal(shouldSkipBackgroundPermissionPrompt("granted", false), true);
    assert.equal(shouldSkipBackgroundPermissionPrompt("denied", false), false);
    assert.equal(shouldSkipBackgroundPermissionPrompt("undetermined", null), false);
  });
});
