import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FieldShiftStatus, Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

const MAX_SAMPLES_BATCH = 250;

@Injectable()
export class FieldShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  private utcDayStart(reference: Date): Date {
    return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  }

  async getActive(actor: AuthUser | undefined) {
    const ownerId = actor?.id;
    if (!ownerId) {
      throw new BadRequestException("User is required");
    }
    return this.prisma.fieldShift.findFirst({
      where: { ownerId, status: FieldShiftStatus.ACTIVE },
      orderBy: [{ startedAt: "desc" }],
    });
  }

  async start(
    actor: AuthUser | undefined,
    input: { plannedDistanceKm?: number | null; trackingEnabled?: boolean },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const ownerId = actor.id;
    const date = this.utcDayStart(new Date());

    const existingToday = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date, status: FieldShiftStatus.ACTIVE },
      orderBy: [{ startedAt: "desc" }],
    });
    if (existingToday) {
      return this.prisma.fieldShift.update({
        where: { id: existingToday.id },
        data: {
          plannedDistanceKm:
            input.plannedDistanceKm != null ? input.plannedDistanceKm : existingToday.plannedDistanceKm,
          trackingEnabled:
            input.trackingEnabled !== undefined ? input.trackingEnabled : existingToday.trackingEnabled,
        },
      });
    }

    await this.prisma.fieldShift.updateMany({
      where: { ownerId, status: FieldShiftStatus.ACTIVE },
      data: { status: FieldShiftStatus.ENDED, endedAt: new Date() },
    });

    return this.prisma.fieldShift.create({
      data: {
        ownerId,
        date,
        status: FieldShiftStatus.ACTIVE,
        plannedDistanceKm: input.plannedDistanceKm ?? undefined,
        trackingEnabled: input.trackingEnabled ?? true,
      },
    });
  }

  async end(actor: AuthUser | undefined, shiftId: string) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const shift = await this.prisma.fieldShift.findFirst({
      where: { id: shiftId, ownerId: actor.id },
    });
    if (!shift) {
      throw new NotFoundException("Shift not found");
    }
    if (shift.status === FieldShiftStatus.ENDED) {
      return shift;
    }
    return this.prisma.fieldShift.update({
      where: { id: shiftId },
      data: { status: FieldShiftStatus.ENDED, endedAt: new Date() },
    });
  }

  async appendSamples(
    actor: AuthUser | undefined,
    shiftId: string,
    items: { lat: number; lng: number; accuracyM?: number | null; clientRecordedAt: string }[],
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!items.length) {
      throw new BadRequestException("items is required");
    }
    if (items.length > MAX_SAMPLES_BATCH) {
      throw new BadRequestException(`At most ${MAX_SAMPLES_BATCH} samples per request`);
    }
    const shift = await this.prisma.fieldShift.findFirst({
      where: { id: shiftId, ownerId: actor.id },
    });
    if (!shift) {
      throw new NotFoundException("Shift not found");
    }
    if (shift.status !== FieldShiftStatus.ACTIVE) {
      throw new BadRequestException("Shift is not active");
    }
    if (!shift.trackingEnabled) {
      throw new BadRequestException("Tracking is disabled for this shift");
    }

    const rows: Prisma.FieldLocationSampleCreateManyInput[] = [];
    for (const it of items) {
      if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) {
        throw new BadRequestException("Invalid lat/lng");
      }
      const clientRecordedAt = new Date(it.clientRecordedAt);
      if (Number.isNaN(clientRecordedAt.getTime())) {
        throw new BadRequestException("Invalid clientRecordedAt");
      }
      rows.push({
        shiftId,
        lat: it.lat,
        lng: it.lng,
        accuracyM:
          it.accuracyM != null && Number.isFinite(Number(it.accuracyM)) ? Number(it.accuracyM) : undefined,
        clientRecordedAt,
      });
    }

    await this.prisma.fieldLocationSample.createMany({ data: rows });
    return { created: rows.length };
  }
}
