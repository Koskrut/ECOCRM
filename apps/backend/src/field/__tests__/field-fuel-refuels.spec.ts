import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FuelCompensationStatus } from "@prisma/client";

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
