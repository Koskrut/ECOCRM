import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  ClientPlatform,
  FieldShiftStatus,
  FieldTrackingEventType,
  FieldTrackingRestartReason,
  Prisma,
} from "@prisma/client";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { AuthUser } from "../auth/auth.types";
import { todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { RoutePlansService } from "../visits/route-plans.service";
import {
  assertCanAccessOwner,
  getAllowedOwnerIds,
} from "../visits/visits-owner-scope";
import { filterGpsSample, filterGpsTrack } from "./gps-sample-filter";
import { SHIFT_ENDED_EVENT } from "./field.events";
import { deriveDevicePresence, deriveGpsStatus } from "./field-team-status";
import type { FieldShiftTeamItem, FieldTeamTrackingRestartReason } from "./field-shifts.types";

const MAX_SAMPLES_BATCH = 250;
const MAX_SAMPLES_READ = 500;

@Injectable()
export class FieldShiftsService {
  private readonly logger = new Logger(FieldShiftsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routePlans: RoutePlansService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private calendarDateKey(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00.000Z`);
  }

  private async closeShift(shiftId: string, ownerId: string, endedAt = new Date()) {
    const updated = await this.prisma.fieldShift.update({
      where: { id: shiftId },
      data: { status: FieldShiftStatus.ENDED, endedAt },
    });
    const dateStr = updated.date.toISOString().slice(0, 10);
    void this.eventEmitter.emitAsync(SHIFT_ENDED_EVENT, {
      ownerId,
      dateStr,
    });
    return updated;
  }

  async closeStaleActiveShifts(opts: { ownerId?: string } = {}) {
    const todayKey = this.calendarDateKey(todayYmdKyiv());
    const ownerFilter: Prisma.FieldShiftWhereInput["ownerId"] =
      opts.ownerId != null ? opts.ownerId : undefined;

    const stale = await this.prisma.fieldShift.findMany({
      where: {
        status: FieldShiftStatus.ACTIVE,
        ...(ownerFilter ? { ownerId: ownerFilter } : {}),
        date: { lt: todayKey },
      },
      select: { id: true, ownerId: true },
      orderBy: { startedAt: "asc" },
    });

    if (stale.length === 0) return { closed: 0 };

    await Promise.all(
      stale.map((s) => this.closeShift(s.id, s.ownerId)),
    );

    return { closed: stale.length };
  }

  async getActive(actor: AuthUser | undefined) {
    const ownerId = actor?.id;
    if (!ownerId) {
      throw new BadRequestException("User is required");
    }
    await this.closeStaleActiveShifts({ ownerId });
    const todayKey = this.calendarDateKey(todayYmdKyiv());
    return this.prisma.fieldShift.findFirst({
      where: { ownerId, status: FieldShiftStatus.ACTIVE, date: todayKey },
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
    const date = this.calendarDateKey(todayYmdKyiv());

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
    return this.closeShift(shiftId, shift.ownerId);
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

    const lastDb = await this.prisma.fieldLocationSample.findFirst({
      where: { shiftId },
      orderBy: { clientRecordedAt: "desc" },
      select: { lat: true, lng: true, accuracyM: true, clientRecordedAt: true },
    });

    let prev: {
      lat: number;
      lng: number;
      accuracyM?: number | null;
      clientRecordedAt: Date;
    } | null = lastDb;

    const rows: Prisma.FieldLocationSampleCreateManyInput[] = [];
    let rejected = 0;
    const rejectReasons: Record<string, number> = {};

    for (const it of items) {
      if (!Number.isFinite(it.lat) || !Number.isFinite(it.lng)) {
        throw new BadRequestException("Invalid lat/lng");
      }
      const clientRecordedAt = new Date(it.clientRecordedAt);
      if (Number.isNaN(clientRecordedAt.getTime())) {
        throw new BadRequestException("Invalid clientRecordedAt");
      }

      const candidate = {
        lat: it.lat,
        lng: it.lng,
        accuracyM:
          it.accuracyM != null && Number.isFinite(Number(it.accuracyM)) ? Number(it.accuracyM) : undefined,
        clientRecordedAt,
      };

      const verdict = filterGpsSample(prev, candidate);
      if (!verdict.accept) {
        rejected += 1;
        const reason = verdict.reason ?? "unknown";
        rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
        continue;
      }

      rows.push({
        shiftId,
        lat: candidate.lat,
        lng: candidate.lng,
        accuracyM: candidate.accuracyM,
        clientRecordedAt,
      });
      prev = candidate;
    }

    if (rows.length > 0) {
      await this.prisma.fieldLocationSample.createMany({ data: rows });
    }

    if (rejected > 0 || rows.length > 0) {
      this.logger.log(
        `appendSamples shiftId=${shiftId} ownerId=${actor.id} created=${rows.length} rejected=${rejected} rejectReasons=${JSON.stringify(rejectReasons)}`,
      );
    }

    return { created: rows.length, rejected };
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
    const todayStart = this.calendarDateKey(todayYmdKyiv());

    const [samples, sampleCounts, sessions, presenceSessions, restartEvents] = await Promise.all([
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
      this.prisma.userActivitySession.findMany({
        where: {
          userId: { in: ownerIds },
          platform: ClientPlatform.MOBILE,
        },
        orderBy: { lastSeenAt: "desc" },
        select: {
          userId: true,
          lastSeenAt: true,
          appState: true,
          trackingMode: true,
        },
      }),
      this.prisma.fieldTrackingEvent.findMany({
        where: {
          shiftId: { in: shiftIds },
          type: FieldTrackingEventType.TRACKING_TASK_RESTARTED,
          clientRecordedAt: { gte: todayStart },
        },
        orderBy: { clientRecordedAt: "desc" },
        select: {
          shiftId: true,
          clientRecordedAt: true,
          reason: true,
        },
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

    const restartCountByShift = new Map<string, number>();
    const lastRestartByShift = new Map<
      string,
      { at: Date; reason: FieldTrackingRestartReason | null }
    >();
    for (const event of restartEvents) {
      restartCountByShift.set(
        event.shiftId,
        (restartCountByShift.get(event.shiftId) ?? 0) + 1,
      );
      if (!lastRestartByShift.has(event.shiftId)) {
        lastRestartByShift.set(event.shiftId, {
          at: event.clientRecordedAt,
          reason: event.reason,
        });
      }
    }

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

    const presenceByOwner = new Map<string, (typeof presenceSessions)[number]>();
    for (const row of presenceSessions) {
      if (!presenceByOwner.has(row.userId)) {
        presenceByOwner.set(row.userId, row);
      }
    }

    const nowMs = Date.now();
    const items: FieldShiftTeamItem[] = shifts.map((shift) => {
      const last = lastByShift.get(shift.id);
      const session = sessionByOwner.get(shift.ownerId);
      const visit = session?.currentVisitId ? visitById.get(session.currentVisitId) : undefined;
      const presence = presenceByOwner.get(shift.ownerId);
      const restartCount = restartCountByShift.get(shift.id) ?? 0;
      const lastRestart = lastRestartByShift.get(shift.id);
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
        device: deriveDevicePresence(presence, nowMs),
        gpsStatus: deriveGpsStatus(
          shift.trackingEnabled,
          last?.clientRecordedAt ?? null,
          nowMs,
        ),
        trackingRestart:
          restartCount > 0
            ? {
                lastRestartAt: lastRestart?.at.toISOString() ?? null,
                restartCountToday: restartCount,
                lastRestartReason: this.toApiRestartReason(lastRestart?.reason ?? null),
              }
            : null,
      };
    });

    return { items };
  }

  private toApiRestartReason(
    reason: FieldTrackingRestartReason | null,
  ): FieldTeamTrackingRestartReason | null {
    switch (reason) {
      case FieldTrackingRestartReason.OS_KILL:
        return "os_kill";
      case FieldTrackingRestartReason.TIER_CHANGE:
        return "tier_change";
      case FieldTrackingRestartReason.APPSTATE:
        return "appstate";
      case FieldTrackingRestartReason.WATCHDOG:
        return "watchdog";
      default:
        return null;
    }
  }

  private fromApiRestartReason(
    reason: string | undefined,
  ): FieldTrackingRestartReason | null {
    switch (reason) {
      case "os_kill":
        return FieldTrackingRestartReason.OS_KILL;
      case "tier_change":
        return FieldTrackingRestartReason.TIER_CHANGE;
      case "appstate":
        return FieldTrackingRestartReason.APPSTATE;
      case "watchdog":
        return FieldTrackingRestartReason.WATCHDOG;
      default:
        return null;
    }
  }

  async recordTrackingEvent(
    actor: AuthUser | undefined,
    shiftId: string,
    body: { type: string; reason?: string; clientRecordedAt: string },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (body.type !== "tracking_task_restarted") {
      throw new BadRequestException("Unsupported tracking event type");
    }

    const clientRecordedAt = new Date(body.clientRecordedAt);
    if (Number.isNaN(clientRecordedAt.getTime())) {
      throw new BadRequestException("Invalid clientRecordedAt");
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

    const event = await this.prisma.fieldTrackingEvent.create({
      data: {
        shiftId,
        ownerId: actor.id,
        type: FieldTrackingEventType.TRACKING_TASK_RESTARTED,
        reason: this.fromApiRestartReason(body.reason),
        clientRecordedAt,
      },
    });

    return {
      ok: true,
      event: {
        id: event.id,
        type: "tracking_task_restarted",
        reason: this.toApiRestartReason(event.reason),
        clientRecordedAt: event.clientRecordedAt.toISOString(),
      },
    };
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
    const filtered = filterGpsTrack(
      items.map((s) => ({
        lat: s.lat,
        lng: s.lng,
        accuracyM: s.accuracyM,
        clientRecordedAt: s.clientRecordedAt,
      })),
    );
    const points = filtered.map((s) => ({ lat: s.lat, lng: s.lng }));
    const geometry = await this.routePlans.snapGpsPathToRoads(points, opts);
    return {
      sampleCount: filtered.length,
      ...geometry,
    };
  }
}
