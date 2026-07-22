/**
 * One-off: recalculate DRAFT fuel reports with inflated GPS trackKm after 0.2.115 snap bug.
 *
 * Does NOT touch SUBMITTED / APPROVED reports.
 *
 * Usage (from apps/backend):
 *   npx ts-node scripts/recalculate-inflated-gps-fuel-drafts.ts
 *   npx ts-node scripts/recalculate-inflated-gps-fuel-drafts.ts --dry-run
 */

import "dotenv/config";
import { FuelCompensationStatus } from "@prisma/client";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "../src/app.module";
import { FieldFuelService } from "../src/field/field-fuel.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { TRACK_VS_VISITS_MAX_RATIO } from "../src/visits/route-routing.util";

const DATE_FROM = "2026-07-07";
const DATE_TO = "2026-07-21";
const TRACK_OUTLIER_KM = 50;

type Snapshot = {
  trackKm?: number | null;
  visitRouteKm?: number | null;
};

function isInflatedTrack(snap: Snapshot): boolean {
  const trackKm = snap.trackKm;
  if (trackKm == null || !Number.isFinite(trackKm)) return false;
  const visitRouteKm = snap.visitRouteKm;
  if (
    visitRouteKm != null &&
    Number.isFinite(visitRouteKm) &&
    visitRouteKm >= 2 &&
    trackKm > visitRouteKm * TRACK_VS_VISITS_MAX_RATIO
  ) {
    return true;
  }
  return trackKm > TRACK_OUTLIER_KM;
}

function ymdFromDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });
  const prisma = app.get(PrismaService);
  const fuel = app.get(FieldFuelService);

  try {
    const reports = await prisma.fuelDayReport.findMany({
      where: {
        compensationStatus: FuelCompensationStatus.DRAFT,
        compensationKm: { not: null },
        date: {
          gte: new Date(`${DATE_FROM}T00:00:00.000Z`),
          lte: new Date(`${DATE_TO}T23:59:59.999Z`),
        },
      },
      select: {
        id: true,
        ownerId: true,
        date: true,
        compensationKm: true,
        calculationSnapshot: true,
      },
      orderBy: [{ date: "asc" }, { ownerId: "asc" }],
    });

    const targets = reports.filter((r) => {
      const snap = (r.calculationSnapshot ?? {}) as Snapshot;
      return isInflatedTrack(snap);
    });

    console.log(
      `Found ${targets.length} inflated DRAFT report(s) in ${DATE_FROM}…${DATE_TO} (of ${reports.length} DRAFT with compensationKm)`,
    );

    for (const r of targets) {
      const snap = (r.calculationSnapshot ?? {}) as Snapshot;
      const dateStr = ymdFromDate(r.date);
      console.log(
        `${dryRun ? "[dry-run] " : ""}recalc owner=${r.ownerId} date=${dateStr} trackKm=${snap.trackKm} visitRouteKm=${snap.visitRouteKm} compensationKm=${r.compensationKm}`,
      );
      if (!dryRun) {
        await fuel.recalculateForOwner(r.ownerId, dateStr);
      }
    }

    console.log(dryRun ? "Dry run complete." : `Recalculated ${targets.length} report(s).`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
