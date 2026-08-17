import test from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../../crm-timezone";
import {
  migrateLegacyPackDefaults,
  packCycleStartYmdKyiv,
  resolvePackCycleStartUtc,
} from "../pack-cycle.util";

function kyivNoon(ymd: string): Date {
  return DateTime.fromISO(`${ymd}T12:00:00`, { zone: CRM_TIME_ZONE }).toJSDate();
}

test("pack week starts last Friday on Monday–Thursday", () => {
  assert.equal(packCycleStartYmdKyiv(kyivNoon("2026-08-17")), "2026-08-14");
  assert.equal(packCycleStartYmdKyiv(kyivNoon("2026-08-20")), "2026-08-14");
});

test("pack week starts this Friday on Friday–Sunday", () => {
  assert.equal(packCycleStartYmdKyiv(kyivNoon("2026-08-21")), "2026-08-21");
  assert.equal(packCycleStartYmdKyiv(kyivNoon("2026-08-22")), "2026-08-21");
  assert.equal(packCycleStartYmdKyiv(kyivNoon("2026-08-23")), "2026-08-21");
});

test("resolvePackCycleStartUtc defaults to Friday week and accepts YYYY-MM-DD", () => {
  const fromYmd = resolvePackCycleStartUtc("2026-08-21");
  assert.equal(DateTime.fromJSDate(fromYmd).setZone(CRM_TIME_ZONE).toISODate(), "2026-08-21");
  const fromDefault = resolvePackCycleStartUtc(undefined, kyivNoon("2026-08-17"));
  assert.equal(DateTime.fromJSDate(fromDefault).setZone(CRM_TIME_ZONE).toISODate(), "2026-08-14");
});

test("migrateLegacyPackDefaults only rewrites the old 14/3500 pair", () => {
  assert.deepEqual(migrateLegacyPackDefaults(14, 3500, { packCycleDays: 7, packCapacityPerCycle: 2000 }), {
    packCycleDays: 7,
    packCapacityPerCycle: 2000,
  });
  assert.deepEqual(migrateLegacyPackDefaults(14, 2000, { packCycleDays: 7, packCapacityPerCycle: 2000 }), {
    packCycleDays: 14,
    packCapacityPerCycle: 2000,
  });
});
