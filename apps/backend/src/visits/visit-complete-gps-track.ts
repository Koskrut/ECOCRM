import { FieldShiftStatus, type Prisma } from "@prisma/client";
import { instantToKyivYmd } from "../crm-timezone";
import { filterGpsSample } from "../field/gps-sample-filter";

type PrismaClientLike = {
  fieldShift: {
    findFirst: (args: {
      where: Prisma.FieldShiftWhereInput;
      select: { id: true };
    }) => Promise<{ id: string } | null>;
  };
  fieldLocationSample: {
    findFirst: (args: {
      where: { shiftId: string };
      orderBy: { clientRecordedAt: "desc" };
      select: { lat: true; lng: true; accuracyM: true; clientRecordedAt: true };
    }) => Promise<{
      lat: number;
      lng: number;
      accuracyM: number | null;
      clientRecordedAt: Date;
    } | null>;
    create: (args: {
      data: {
        shiftId: string;
        lat: number;
        lng: number;
        accuracyM?: number;
        clientRecordedAt: Date;
      };
    }) => Promise<unknown>;
  };
};

/**
 * Best-effort: when a visit is completed with GPS, append one sample to the
 * owner's ACTIVE tracking-enabled shift for the visit's Kyiv calendar day.
 */
export async function dualWriteCompleteGpsToActiveShift(
  prisma: PrismaClientLike,
  opts: {
    ownerId: string;
    lat: number;
    lng: number;
    accuracyM?: number | null;
    clientRecordedAt: Date;
    /** Instant used to pick the Kyiv calendar day (visit startsAt / completedAt). */
    dayRef?: Date;
  },
): Promise<{ created: boolean; reason?: string }> {
  if (!Number.isFinite(opts.lat) || !Number.isFinite(opts.lng)) {
    return { created: false, reason: "invalid_coords" };
  }

  const dayInstant = opts.dayRef ?? opts.clientRecordedAt;
  const dateKey = new Date(`${instantToKyivYmd(dayInstant)}T00:00:00.000Z`);
  const shift = await prisma.fieldShift.findFirst({
    where: {
      ownerId: opts.ownerId,
      status: FieldShiftStatus.ACTIVE,
      trackingEnabled: true,
      date: dateKey,
    },
    select: { id: true },
  });
  if (!shift) {
    return { created: false, reason: "no_active_tracking_shift" };
  }

  const lastDb = await prisma.fieldLocationSample.findFirst({
    where: { shiftId: shift.id },
    orderBy: { clientRecordedAt: "desc" },
    select: { lat: true, lng: true, accuracyM: true, clientRecordedAt: true },
  });

  const candidate = {
    lat: opts.lat,
    lng: opts.lng,
    accuracyM:
      opts.accuracyM != null && Number.isFinite(Number(opts.accuracyM))
        ? Number(opts.accuracyM)
        : undefined,
    clientRecordedAt: opts.clientRecordedAt,
  };

  const verdict = filterGpsSample(lastDb, candidate);
  if (!verdict.accept) {
    return { created: false, reason: verdict.reason ?? "filtered" };
  }

  await prisma.fieldLocationSample.create({
    data: {
      shiftId: shift.id,
      lat: candidate.lat,
      lng: candidate.lng,
      accuracyM: candidate.accuracyM,
      clientRecordedAt: candidate.clientRecordedAt,
    },
  });

  return { created: true };
}
