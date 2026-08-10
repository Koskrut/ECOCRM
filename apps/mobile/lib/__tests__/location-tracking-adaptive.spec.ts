const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

describe("location-tracking-adaptive background profile", () => {
  it("backgroundOptionsForTier uses fixed BACKGROUND_FGS_TIER in source", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../location-tracking-adaptive.ts"),
      "utf8",
    );
    assert.match(src, /watchOptionsForTier\(BACKGROUND_FGS_TIER\)/);
    assert.doesNotMatch(src, /watchOptionsForTier\(tier\)/);
  });

  it("config defines BACKGROUND_FGS_TIER as city (non-idle)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../location-tracking-config.ts"),
      "utf8",
    );
    assert.match(src, /BACKGROUND_FGS_TIER:\s*SamplingTier\s*=\s*"city"/);
  });
});

describe("location-tracking-task background safety", () => {
  it("uses validateRawLocationSample and pending tier only (no FGS tier restart)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../location-tracking-task.ts"),
      "utf8",
    );
    assert.match(src, /validateRawLocationSample/);
    assert.match(src, /setPendingAdaptiveTier/);
    assert.doesNotMatch(src, /applyAdaptiveTier/);
    assert.doesNotMatch(src, /restartBackgroundWatch/);
  });
});
