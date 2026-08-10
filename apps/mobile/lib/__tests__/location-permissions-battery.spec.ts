const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  buildBatteryOptimizationPackageUri,
} = require("../battery-intent");

describe("buildBatteryOptimizationPackageUri", () => {
  it("builds android package URI for battery whitelist intent", () => {
    assert.equal(
      buildBatteryOptimizationPackageUri("dental.suprex.crm.manager"),
      "package:dental.suprex.crm.manager",
    );
  });
});
