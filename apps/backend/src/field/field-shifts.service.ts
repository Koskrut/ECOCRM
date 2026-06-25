import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { FieldShiftStatus, Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { RoutePlansService } from "../visits/route-plans.service";
import {
  assertCanAccessOwner,
  getAllowedOwnerIds,
} from "../visits/visits-owner-scope";
import type { FieldShiftTeamItem } from "./field-shifts.types";

const MAX_SAMPLES_BATCH = 250;
const MAX_SAMPLES_READ = 500;

@Injectable()
export class FieldShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routePlans: RoutePlansService,
  ) {}

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

  private visitTitle(v: {
    title: string | null;
    contact: { firstName: string | null; lastName: string | null } | null;
    company: { name: string | null } | null;
  }): string | null {
    if (v.title?.trim()) return v.title.trim();
    if (v.contact) {
      const name = [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
      if (name) return name;
    }
    if (v.company?.name) return v.company.name;
    return null;
  }

  async getActiveTeam(actor: AuthUser | undefined): Promise<{ items: FieldShiftTeamItem[] }> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const allowed = await getAllowedOwnerIds(this.prisma, actor);
    const ownerFilter: Prisma.FieldShiftWhereInput["ownerId"] =
      allowed === "all" ? undefined : { in: allowed };

    const shifts = await this.prisma.fieldShift.findMany({
      where: {
        status: FieldShiftStatus.ACTIVE,
        ...(ownerFilter != null ? { ownerId: ownerFilter } : {}),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ startedAt: "desc" }],
    });

    if (shifts.length === 0) {
      return { items: [] };
    }

    const shiftIds = shifts.map((s) => s.id);
    const ownerIds = [...new Set(shifts.map((s) => s.ownerId))];

    const [samples, sampleCounts, sessions] = await Promise.all([
      this.prisma.fieldLocationSample.findMany({
        where: { shiftId: { in: shiftIds } },
        orderBy: [{ clientRecordedAt: "desc" }],
        select: {
          shiftId: true,
          lat: true,
          lng: true,
          accuracyM: true,
          clientRecordedAt: true,
        },
      }),
      this.prisma.fieldLocationSample.groupBy({
        by: ["shiftId"],
        where: { shiftId: { in: shiftIds } },
        _count: { _all: true },
      }),
      this.prisma.routeSession.findMany({
        where: { ownerId: { in: ownerIds }, isActive: true },
        select: { ownerId: true, currentVisitId: true },
      }),
    ]);

    const lastByShift = new Map<string, (typeof samples)[number]>();
    for (const s of samples) {
      if (!lastByShift.has(s.shiftId)) {
        lastByShift.set(s.shiftId, s);
      }
    }

    const countByShift = new Map(
      sampleCounts.map((c) => [c.shiftId, c._count._all] as const),
    );

    const visitIds = sessions
      .map((s) => s.currentVisitId)
      .filter((id): id is string => typeof id === "string" && id.length > 0);
    const visits =
      visitIds.length > 0
        ? await this.prisma.visit.findMany({
            where: { id: { in: visitIds } },
            select: {
              id: true,
              title: true,
              status: true,
              contact: { select: { firstName: true, lastName: true } },
              company: { select: { name: true } },
            },
          })
        : [];
    const visitById = new Map(visits.map((v) => [v.id, v] as const));
    const sessionByOwner = new Map(sessions.map((s) => [s.ownerId, s] as const));

    const items: FieldShiftTeamItem[] = shifts.map((shift) => {
      const last = lastByShift.get(shift.id);
      const session = sessionByOwner.get(shift.ownerId);
      const visit = session?.currentVisitId ? visitById.get(session.currentVisitId) : undefined;
      return {
        shift: {
          id: shift.id,
          ownerId: shift.ownerId,
          date: shift.date.toISOString(),
          status: shift.status,
          startedAt: shift.startedAt.toISOString(),
          endedAt: shift.endedAt?.toISOString() ?? null,
          trackingEnabled: shift.trackingEnabled,
          plannedDistanceKm: shift.plannedDistanceKm,
        },
        owner: shift.owner,
        lastSample: last
          ? {
              lat: last.lat,
              lng: last.lng,
              accuracyM: last.accuracyM,
              clientRecordedAt: last.clientRecordedAt.toISOString(),
            }
          : null,
        sampleCountToday: countByShift.get(shift.id) ?? 0,
        currentVisit: visit
          ? {
              id: visit.id,
              title: this.visitTitle(visit),
              status: visit.status,
            }
          : null,
      };
    });

    return { items };
  }

  async getSamples(
    actor: AuthUser | undefined,
    shiftId: string,
    opts?: { since?: string; limit?: number },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const shift = await this.prisma.fieldShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) {
      throw new NotFoundException("Shift not found");
    }
    await assertCanAccessOwner(this.prisma, actor, shift.ownerId);

    const limit = Math.min(
      MAX_SAMPLES_READ,
      opts?.limit != null && Number.isFinite(opts.limit) ? Math.max(1, opts.limit) : MAX_SAMPLES_READ,
    );
    const sinceDate =
      opts?.since != null && opts.since.trim()
        ? new Date(opts.since)
        : null;
    if (sinceDate && Number.isNaN(sinceDate.getTime())) {
      throw new BadRequestException("Invalid since");
    }

    const rows = await this.prisma.fieldLocationSample.findMany({
      where: {
        shiftId,
        ...(sinceDate ? { clientRecordedAt: { gt: sinceDate } } : {}),
      },
      orderBy: { clientRecordedAt: "asc" },
      take: limit + 1,
      select: {
        id: true,
        lat: true,
        lng: true,
        accuracyM: true,
        clientRecordedAt: true,
        createdAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    return {
      items: items.map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        accuracyM: r.accuracyM,
        clientRecordedAt: r.clientRecordedAt.toISOString(),
        createdAt: r.createdAt.toISOString(),
      })),
      hasMore,
    };
  }

  async getTrackGeometry(
    actor: AuthUser | undefined,
    shiftId: string,
    opts?: { traffic?: boolean },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const shift = await this.prisma.fieldShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) {
      throw new NotFoundException("Shift not found");
    }
    await assertCanAccessOwner(this.prisma, actor, shift.ownerId);

    const { items } = await this.getSamples(actor, shiftId, { limit: MAX_SAMPLES_READ });
    const points = items.map((s) => ({ lat: s.lat, lng: s.lng }));
    const geometry = await this.routePlans.snapGpsPathToRoads(points, opts);
    return {
      sampleCount: items.length,
      ...geometry,
    };
  }
}
