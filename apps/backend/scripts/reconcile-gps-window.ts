/**
 * Reconcile GPS sampleIds for one owner and short time window.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/reconcile-gps-window.ts --owner=<id> --from=2026-08-20T08:00:00Z --to=2026-08-20T08:15:00Z
 */

import "dotenv/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

function parseArgs(argv: string[]) {
  const out = {
    owner: null as string | null,
    from: null as string | null,
    to: null as string | null,
  };
  for (const a of argv) {
    if (a.startsWith("--owner=")) out.owner = a.slice("--owner=".length);
    else if (a.startsWith("--from=")) out.from = a.slice("--from=".length);
    else if (a.startsWith("--to=")) out.to = a.slice("--to=".length);
  }
  return out;
}

function asDate(input: string | null, name: string): Date {
  if (!input) {
    throw new Error(`Missing required argument: --${name}=<ISO>`);
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ${name}: ${input}`);
  }
  return d;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.owner) {
    throw new Error("Missing required argument: --owner=<id>");
  }
  const from = asDate(args.from, "from");
  const to = asDate(args.to, "to");

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);
  try {
    const samples = await prisma.fieldLocationSample.findMany({
      where: {
        ownerId: args.owner,
        clientRecordedAt: { gte: from, lte: to },
      },
      orderBy: [{ clientRecordedAt: "asc" }],
      select: {
        sampleId: true,
        shiftId: true,
        deviceId: true,
        clientRecordedAt: true,
      },
    });
    console.log(
      `[gps-reconcile] owner=${args.owner} from=${from.toISOString()} to=${to.toISOString()} rows=${samples.length}`,
    );

    const withSampleId = samples.filter((s) => !!s.sampleId);
    const bySampleId = new Map<
      string,
      Array<{ shiftId: string; deviceId: string | null; at: Date }>
    >();
    for (const row of withSampleId) {
      const id = row.sampleId!;
      const arr = bySampleId.get(id) ?? [];
      arr.push({ shiftId: row.shiftId, deviceId: row.deviceId, at: row.clientRecordedAt });
      bySampleId.set(id, arr);
    }

    let repeated = 0;
    let crossShift = 0;
    for (const [sampleId, rows] of bySampleId.entries()) {
      if (rows.length > 1) {
        repeated += 1;
      }
      const shifts = new Set(rows.map((r) => r.shiftId));
      if (shifts.size > 1) {
        crossShift += 1;
        console.log(
          `[cross-shift] sampleId=${sampleId} shifts=${Array.from(shifts).join(",")} count=${rows.length}`,
        );
      }
    }

    console.log(
      `[gps-reconcile] withSampleId=${withSampleId.length} repeatedSampleIds=${repeated} crossShiftSampleIds=${crossShift}`,
    );
    console.log("Use backend logs for created/duplicate/rejected in the same time window.");
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
