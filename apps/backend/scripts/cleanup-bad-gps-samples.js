/**
 * Remove FieldLocationSample rows outside UA field bbox (emulator/mock abroad).
 * Dry-run by default — pass --apply to delete.
 *
 * Usage (from apps/backend):
 *   node scripts/cleanup-bad-gps-samples.js
 *   node scripts/cleanup-bad-gps-samples.js --apply
 *   node scripts/cleanup-bad-gps-samples.js --since=2026-07-01 --apply
 */

/* eslint-disable no-console */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const UA_FIELD_LAT_MIN = 44;
const UA_FIELD_LAT_MAX = 53;
const UA_FIELD_LNG_MIN = 22;
const UA_FIELD_LNG_MAX = 41;

function isInUaFieldRegion(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= UA_FIELD_LAT_MIN &&
    lat <= UA_FIELD_LAT_MAX &&
    lng >= UA_FIELD_LNG_MIN &&
    lng <= UA_FIELD_LNG_MAX
  );
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  let since = null;
  for (const a of argv) {
    if (a.startsWith("--since=")) {
      since = a.slice("--since=".length);
    }
  }
  return { apply, since };
}

async function main() {
  const { apply, since } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    const where = {};
    if (since) {
      where.clientRecordedAt = { gte: new Date(`${since}T00:00:00.000Z`) };
    }

    // Pull candidates with absurd coords cheaply via OR outside bbox.
    const candidates = await prisma.fieldLocationSample.findMany({
      where: {
        ...where,
        OR: [
          { lat: { lt: UA_FIELD_LAT_MIN } },
          { lat: { gt: UA_FIELD_LAT_MAX } },
          { lng: { lt: UA_FIELD_LNG_MIN } },
          { lng: { gt: UA_FIELD_LNG_MAX } },
        ],
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        shiftId: true,
        clientRecordedAt: true,
        shift: {
          select: {
            id: true,
            date: true,
            ownerId: true,
            owner: { select: { fullName: true, email: true } },
          },
        },
      },
      orderBy: { clientRecordedAt: "asc" },
    });

    const bad = candidates.filter((s) => !isInUaFieldRegion(s.lat, s.lng));
    const byOwner = new Map();
    const byShift = new Map();

    for (const s of bad) {
      const ownerKey = `${s.shift.owner.fullName} <${s.shift.owner.email}>`;
      byOwner.set(ownerKey, (byOwner.get(ownerKey) ?? 0) + 1);
      const shiftKey = `${s.shiftId} (${s.shift.owner.fullName}, ${s.shift.date.toISOString().slice(0, 10)})`;
      byShift.set(shiftKey, (byShift.get(shiftKey) ?? 0) + 1);
    }

    console.log(`Mode: ${apply ? "APPLY (delete)" : "DRY-RUN"}`);
    console.log(`Outside UA bbox samples: ${bad.length}`);
    console.log("\nBy owner:");
    for (const [k, n] of [...byOwner.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}\t${k}`);
    }
    console.log("\nBy shift:");
    for (const [k, n] of [...byShift.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${n}\t${k}`);
    }

    if (!apply) {
      console.log("\nNo rows deleted (dry-run). Re-run with --apply to delete.");
      return;
    }

    if (bad.length === 0) {
      console.log("Nothing to delete.");
      return;
    }

    const ids = bad.map((s) => s.id);
    const chunkSize = 500;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const res = await prisma.fieldLocationSample.deleteMany({
        where: { id: { in: chunk } },
      });
      deleted += res.count;
    }
    console.log(`\nDeleted ${deleted} samples outside UA bbox.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
