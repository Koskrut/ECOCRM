import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import {
  CRM_TIME_ZONE,
  datetimeLocalKyivToIso,
  isoToDatetimeLocalKyiv,
  kyivDuePresetIso,
} from "../crmDatetime";

test("datetime-local Kyiv round-trip keeps wall clock", () => {
  const local = "2026-08-31T18:00";
  const iso = datetimeLocalKyivToIso(local);
  assert.ok(iso);
  const back = isoToDatetimeLocalKyiv(iso);
  assert.equal(back, local);
});

test("isoToDatetimeLocalKyiv converts UTC to Kyiv wall time", () => {
  // 15:00 UTC = 18:00 Kyiv in summer (EEST)
  const local = isoToDatetimeLocalKyiv("2026-08-31T15:00:00.000Z");
  assert.equal(local, "2026-08-31T18:00");
});

test("kyivDuePresetIso today is 18:00 Kyiv", () => {
  const now = DateTime.fromISO("2026-08-31T10:00:00", { zone: CRM_TIME_ZONE }) as DateTime<true>;
  const iso = kyivDuePresetIso("today", now);
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  assert.equal(dt.toFormat("yyyy-MM-dd HH:mm"), "2026-08-31 18:00");
});
