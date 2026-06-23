import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Regression: 0.2.81 prod crash — SettingsService undefined in TelegramService DI
 * when settings.service imported ringostat-ingest → notifications → telegram → settings chain.
 */
describe("Telegram DI (circular import guard)", () => {
  it("SettingsService and TelegramService exports resolve after notifications chain load", () => {
    require("../../../settings/settings.service");
    require("../../../notifications/notifications.module");
    const { SettingsService } = require("../../../settings/settings.service");
    const { TelegramService } = require("../telegram.service");
    const { RINGOSTAT_PROVIDER } = require("../../ringostat/ringostat.constants");

    assert.equal(typeof SettingsService, "function");
    assert.equal(typeof TelegramService, "function");
    assert.equal(typeof RINGOSTAT_PROVIDER, "string");
  });
});
