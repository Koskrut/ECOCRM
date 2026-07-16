import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import {
  assertFreshSnapshot,
  evaluateSnapshotFreshness,
} from "../snapshot-freshness.util";

const now = new Date("2026-07-15T12:00:00.000Z");

test("snapshot freshness: missing snapshot is not fresh", () => {
  const f = evaluateSnapshotFreshness(null, 7, now);
  assert.equal(f.isFresh, false);
  assert.match(f.warning ?? "", /No POSTED/);
});

test("snapshot freshness: accepts fresh posted snapshot", () => {
  const f = evaluateSnapshotFreshness(
    { id: "s1", postedAt: new Date("2026-07-14T12:00:00.000Z") },
    7,
    now,
  );
  assert.equal(f.isFresh, true);
  assert.equal(f.ageDays, 1);
  assert.equal(f.warning, null);
});

test("snapshot freshness: rejects stale snapshot", () => {
  const f = evaluateSnapshotFreshness(
    { id: "s1", postedAt: new Date("2026-07-01T12:00:00.000Z") },
    7,
    now,
  );
  assert.equal(f.isFresh, false);
  assert.throws(() => assertFreshSnapshot(f), BadRequestException);
});
