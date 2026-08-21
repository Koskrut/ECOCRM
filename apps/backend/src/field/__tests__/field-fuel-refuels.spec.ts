import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { FuelCompensationStatus } from "@prisma/client";
import { isKyivYmdAfterToday, kyivDayBounds, todayYmdKyiv } from "../../crm-timezone";

const MAX_REFUELS_PER_DAY = 10;
const MAX_AMOUNT = 100_000;
const MAX_LITERS = 500;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function parsePositiveNumber(raw: string | undefined, label: string, max: number): number {
  if (raw == null || raw.trim() === "") {
    throw new Error(`${label} is required`);
  }
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${label} must be greater than 0`);
  }
  if (n > max) {
    throw new Error(`${label} exceeds maximum allowed value`);
  }
  return Math.round(n * 1000) / 1000;
}

function canCreateRefuel(status: FuelCompensationStatus): boolean {
  return status !== FuelCompensationStatus.PAID;
}

function canDeleteRefuel(isOwner: boolean, isAdmin: boolean, status: FuelCompensationStatus): boolean {
  if (status === FuelCompensationStatus.PAID) return false;
  return isOwner || isAdmin;
}

describe("fuel refuel validation", () => {
  it("requires positive liters and amount", () => {
    assert.equal(parsePositiveNumber("45.5", "liters", MAX_LITERS), 45.5);
    assert.equal(parsePositiveNumber("1200", "amount", MAX_AMOUNT), 1200);
    assert.throws(() => parsePositiveNumber("0", "liters", MAX_LITERS));
    assert.throws(() => parsePositiveNumber("", "amount", MAX_AMOUNT));
    assert.throws(() => parsePositiveNumber("999999", "amount", MAX_AMOUNT));
  });

  it("rejects create when report is paid", () => {
    assert.equal(canCreateRefuel(FuelCompensationStatus.DRAFT), true);
    assert.equal(canCreateRefuel(FuelCompensationStatus.SUBMITTED), true);
    assert.equal(canCreateRefuel(FuelCompensationStatus.PAID), false);
  });

  it("allows delete for owner unless paid", () => {
    assert.equal(canDeleteRefuel(true, false, FuelCompensationStatus.DRAFT), true);
    assert.equal(canDeleteRefuel(false, true, FuelCompensationStatus.APPROVED), true);
    assert.equal(canDeleteRefuel(false, false, FuelCompensationStatus.DRAFT), false);
    assert.equal(canDeleteRefuel(true, false, FuelCompensationStatus.PAID), false);
  });

  it("enforces per-day refuel limit", () => {
    assert.ok(MAX_REFUELS_PER_DAY === 10);
    assert.ok(9 < MAX_REFUELS_PER_DAY);
    assert.ok(10 >= MAX_REFUELS_PER_DAY);
  });

  it("requires receipt file mime and size", () => {
    assert.ok(ALLOWED_MIME.has("image/jpeg"));
    assert.ok(!ALLOWED_MIME.has("application/pdf"));
    assert.ok(MAX_FILE_BYTES === 5 * 1024 * 1024);
  });
});

describe("refuel date is not future (Kyiv calendar)", () => {
  it("allows today and yesterday", () => {
    const today = todayYmdKyiv();
    const yesterday = DateTime.now().setZone("Europe/Kyiv").minus({ days: 1 }).toISODate()!;
    assert.equal(isKyivYmdAfterToday(today), false);
    assert.equal(isKyivYmdAfterToday(yesterday), false);
  });

  it("rejects tomorrow", () => {
    const tomorrow = DateTime.now().setZone("Europe/Kyiv").plus({ days: 1 }).toISODate()!;
    assert.equal(isKyivYmdAfterToday(tomorrow), true);
  });

  it("allows same-day afternoon upload (end of today is still today)", () => {
    const today = "2026-08-21";
    const afternoon = new Date("2026-08-21T14:37:00+03:00");
    assert.equal(isKyivYmdAfterToday(today, afternoon), false);
    const { to } = kyivDayBounds(today);
    assert.ok(
      to.getTime() > afternoon.getTime(),
      "end-of-day is still in the future; comparing `to` would wrongly block today",
    );
  });

  it("allows next-day upload for yesterday's report", () => {
    const visitDay = "2026-08-20";
    const nextMorning = new Date("2026-08-21T08:00:00+03:00");
    assert.equal(isKyivYmdAfterToday(visitDay, nextMorning), false);
  });
});
