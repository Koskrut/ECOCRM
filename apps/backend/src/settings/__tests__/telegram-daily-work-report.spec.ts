import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TELEGRAM_DAILY_WORK_REPORT,
  normalizeTelegramDailyWorkReportConfig,
} from "../settings.service";

test("normalizeTelegramDailyWorkReportConfig applies defaults", () => {
  assert.deepEqual(normalizeTelegramDailyWorkReportConfig(undefined), {
    ...DEFAULT_TELEGRAM_DAILY_WORK_REPORT,
  });
  assert.deepEqual(normalizeTelegramDailyWorkReportConfig({}), {
    ...DEFAULT_TELEGRAM_DAILY_WORK_REPORT,
  });
});

test("normalizeTelegramDailyWorkReportConfig keeps valid overrides", () => {
  assert.deepEqual(
    normalizeTelegramDailyWorkReportConfig({
      enabled: false,
      time: "19:30",
      weekdaysOnly: false,
      teamSummary: false,
    }),
    {
      enabled: false,
      time: "19:30",
      weekdaysOnly: false,
      teamSummary: false,
    },
  );
});

test("normalizeTelegramDailyWorkReportConfig rejects invalid time", () => {
  assert.equal(
    normalizeTelegramDailyWorkReportConfig({ time: "25:99" }).time,
    DEFAULT_TELEGRAM_DAILY_WORK_REPORT.time,
  );
  assert.equal(
    normalizeTelegramDailyWorkReportConfig({ time: "9:00" }).time,
    DEFAULT_TELEGRAM_DAILY_WORK_REPORT.time,
  );
});
