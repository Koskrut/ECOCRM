/**
 * Force-recalculate FuelDayReport rows for a date range (optional owner).
 * Dry-run by default — pass --apply to write.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/bulk-recalculate-fuel-range.ts --from=2026-07-01 --to=2026-07-31
 *   npx ts-node scripts/bulk-recalculate-fuel-range.ts --from=2026-07-01 --to=2026-07-31 --owner=<id> --apply
 *   npx ts-node scripts/bulk-recalculate-fuel-range.ts --from=2026-07-01 --to=2026-07-31 --drafts-only --apply
 */

import "dotenv/config";
import { FuelCompensationStatus } from "@prisma/client";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { FieldFuelService } from "../src/field/field-fuel.service";
import { PrismaService } from "../src/prisma/prisma.service";

function parseArgs(argv: string[]) {
  const out = {
    apply: false,
    draftsOnly: false,
    from: null as string | null,
    to: null as string | null,
    owner: null as string | null,
  };
  for (const a of argv) {
    if (a === "--apply") out.apply = true;
    else if (a === "--drafts-only") out.draftsOnly = true;
    else if (a.startsWith("--from=")) out.from = a.slice("--from=".length);
    else if (a.startsWith("--to=")) out.to = a.slice("--to=".length);
    else if (a.startsWith("--owner=")) out.owner = a.slice("--owner=".length);
  }
  return out;
}

function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.to) {
    console.error(
      "Required: --from=YYYY-MM-DD --to=YYYY-MM-DD [--owner=id] [--drafts-only] [--apply]",
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const prisma = app.get(PrismaService);
  const fuel = app.get(FieldFuelService);

  try {
    const where: {
      date: { gte: Date; lte: Date };
      ownerId?: string;
      compensationStatus?: FuelCompensationStatus;
    } = {
      date: {
        gte: new Date(`${args.from}T00:00:00.000Z`),
        lte: new Date(`${args.to}T23:59:59.999Z`),
      },
    };
    if (args.owner) where.ownerId = args.owner;
    if (args.draftsOnly) where.compensationStatus = FuelCompensationStatus.DRAFT;

    const reports = await prisma.fuelDayReport.findMany({
      where,
      select: {
        ownerId: true,
        date: true,
        compensationKm: true,
        amountEstimated: true,
        metricsSource: true,
        compensationStatus: true,
      },
      orderBy: [{ ownerId: "asc" }, { date: "asc" }],
    });

    console.log(
      `[bulk-recalculate-fuel] mode=${args.apply ? "APPLY" : "DRY-RUN"} reports=${reports.length}`,
    );

    let done = 0;
    for (const r of reports) {
      const dateStr = ymdFromDate(r.date);
      console.log(
        `${args.apply ? "" : "[dry-run] "}recalc owner=${r.ownerId} date=${dateStr} km=${r.compensationKm ?? "null"} amount=${r.amountEstimated ?? "null"} src=${r.metricsSource} status=${r.compensationStatus}`,
      );
      if (args.apply) {
        await fuel.recalculateForOwner(r.ownerId, dateStr);
        done += 1;
      }
    }

    console.log(
      args.apply
        ? `Recalculated ${done} report(s).`
        : "Dry run complete. Pass --apply to write.",
    );
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
