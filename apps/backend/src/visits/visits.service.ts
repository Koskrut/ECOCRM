import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { LocationSource, Prisma, VisitStatus } from "@prisma/client";
import { buildVisitOwnerFilter, assertCanAccessOwner } from "./visits-owner-scope";
import {
  UserRole,
  VisitStatus as VisitStatusEnum,
  VisitOutcome as VisitOutcomeEnum,
  LocationSource as LocationSourceEnum,
  VisitGpsEventKind,
  VisitGpsVerification,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { ActivitiesService } from "../activities/activities.service";
import { PrismaService } from "../prisma/prisma.service";
import { VISIT_COMPLETED_EVENT } from "../field/field.events";
import type { VisitGpsPayloadInput } from "./visit-gps.verification";
import { verifyVisitAgainstPlannedLocation } from "./visit-gps.verification";

type CreateVisitInput = {
  contactId?: string | null;
  companyId?: string | null;
  title?: string | null;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  purpose?: string | null;
};

type UpdateVisitInput = {
  title?: string | null;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  locationSource?: LocationSource | null;
  status?: VisitStatus | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  durationMin?: number | null;
  note?: string | null;
  purpose?: string | null;
};

type CompleteVisitInput = {
  outcome: string;
  resultNote: string;
  nextActionAt?: Date | null;
  nextActionNote?: string | null;
};

@Injectable()
export class VisitsService {
  private readonly logger = new Logger(VisitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activitiesService: ActivitiesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private async assertVisitAccess(visit: { ownerId: string }, actor: AuthUser): Promise<void> {
    await assertCanAccessOwner(this.prisma, actor, visit.ownerId);
  }

  private normalizeClientRecordedAt(v: VisitGpsPayloadInput["clientRecordedAt"]): Date | null {
    if (v == null) return null;
    const d = typeof v === "string" ? new Date(v) : v;
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    return d;
  }

  private async persistVisitGpsLine(
    tx: Prisma.TransactionClient,
    input: {
      visitId: string;
      kind: VisitGpsEventKind;
      verification: VisitGpsVerification;
      distanceToPlannedM: number | null;
      payload: VisitGpsPayloadInput | null;
    },
  ) {
    const p = input.payload;
    await tx.visitGpsEvent.create({
      data: {
        visitId: input.visitId,
        kind: input.kind,
        verification: input.verification,
        distanceToPlannedM:
          typeof input.distanceToPlannedM === "number" && Number.isFinite(input.distanceToPlannedM)
            ? input.distanceToPlannedM
            : undefined,
        lat: typeof p?.lat === "number" && Number.isFinite(p.lat) ? p.lat : undefined,
        lng: typeof p?.lng === "number" && Number.isFinite(p.lng) ? p.lng : undefined,
        accuracyM: typeof p?.accuracyM === "number" && Number.isFinite(p.accuracyM) ? p.accuracyM : undefined,
        clientRecordedAt: this.normalizeClientRecordedAt(p?.clientRecordedAt) ?? undefined,
        permissionState: typeof p?.permissionState === "string" ? p.permissionState : undefined,
        locationProvider: typeof p?.locationProvider === "string" ? p.locationProvider : undefined,
      },
    });
  }

  private async createVisitPlanActivity(
    visit: { contactId?: string | null; companyId?: string | null },
    startsAt: Date,
    actor: AuthUser,
  ) {
    const planBody = `Запланирована на ${startsAt.toLocaleString("uk-UA")}`;
    if (visit.contactId) {
      return this.activitiesService.createForContact(
        visit.contactId,
        {
          type: "MEETING",
          title: "Встреча (план)",
          body: planBody,
          occurredAt: startsAt.toISOString(),
        },
        actor,
      );
    }
    if (visit.companyId) {
      return this.activitiesService.createForCompany(
        visit.companyId,
        {
          type: "MEETING",
          title: "Встреча (план)",
          body: planBody,
          occurredAt: startsAt.toISOString(),
        },
        actor,
      );
    }
    return null;
  }

  private async syncVisitResultActivity(
    visit: { activityId?: string | null; contactId?: string | null; companyId?: string | null },
    body: CompleteVisitInput,
    now: Date,
    actor: AuthUser,
    visitId: string,
  ) {
    const activityBody = body.resultNote.trim();
    const activityTitle = `Встреча (${body.outcome})`;
    if (visit.activityId) {
      await this.prisma.activity.update({
        where: { id: visit.activityId },
        data: {
          title: activityTitle,
          body: activityBody,
          occurredAt: now,
        },
      });
      return;
    }
    if (visit.contactId) {
      await this.activitiesService.createForContact(
        visit.contactId,
        {
          type: "MEETING",
          title: activityTitle,
          body: activityBody,
          occurredAt: now.toISOString(),
        },
        actor,
      );
      return;
    }
    if (visit.companyId) {
      await this.activitiesService.createForCompany(
        visit.companyId,
        {
          type: "MEETING",
          title: activityTitle,
          body: activityBody,
          occurredAt: now.toISOString(),
        },
        actor,
      );
      return;
    }
    this.logger.warn(`Visit ${visitId} has no linked entity for timeline activity sync`);
  }

  async create(body: CreateVisitInput, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }

    const ownerId = actor.id;
    const contactId = body.contactId ?? null;
    const companyId = body.companyId ?? null;

    let contact: {
      id: string;
      phone: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
    } | null = null;
    if (contactId) {
      contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, phone: true, address: true, lat: true, lng: true },
      });
      if (!contact) {
        throw new NotFoundException("Contact not found");
      }
    }

    let company: { id: string; lat: number | null; lng: number | null } | null = null;
    if (companyId) {
      company = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true, lat: true, lng: true },
      });
      if (!company) {
        throw new NotFoundException("Company not found");
      }
    }

    const effectiveLat = body.lat ?? contact?.lat ?? company?.lat ?? null;
    const effectiveLng = body.lng ?? contact?.lng ?? company?.lng ?? null;
    if ((contactId ?? companyId) && (effectiveLat == null || effectiveLng == null)) {
      throw new BadRequestException(
        "Нельзя запланировать встречу: в карточке не заданы координаты (адрес/карта).",
      );
    }

    if (contactId) {
      const existingBacklog = await this.prisma.visit.findFirst({
        where: {
          ownerId,
          contactId,
          status: VisitStatusEnum.PLANNED_UNASSIGNED,
        },
        select: { id: true },
      });
      if (existingBacklog) {
        throw new BadRequestException(
          "У этого контакта уже есть визит в планах (backlog). Добавить второй нельзя.",
        );
      }
    }

    let addressText = body.addressText ?? undefined;
    let phone = body.phone ?? undefined;
    let locationSource: LocationSource | undefined;

    if (!addressText && contact?.address) {
      addressText = contact.address;
      locationSource = LocationSourceEnum.FROM_CONTACT;
    }

    if (!phone && contact?.phone) {
      phone = contact.phone;
    }

    if (!locationSource && body.lat != null && body.lng != null) {
      locationSource = LocationSourceEnum.GEOCODED;
    }
    if (
      !locationSource &&
      body.lat == null &&
      body.lng == null &&
      contact?.lat != null &&
      contact?.lng != null
    ) {
      locationSource = LocationSourceEnum.FROM_CONTACT;
    }

    const data: Prisma.VisitCreateInput = {
      owner: { connect: { id: ownerId } },
      contact: contactId ? { connect: { id: contactId } } : undefined,
      company: companyId ? { connect: { id: companyId } } : undefined,
      title: body.title ?? undefined,
      phone: phone ?? undefined,
      addressText: addressText ?? undefined,
      lat: effectiveLat ?? undefined,
      lng: effectiveLng ?? undefined,
      locationSource: locationSource ?? LocationSourceEnum.NONE,
      status: VisitStatusEnum.PLANNED_UNASSIGNED,
      purpose: body.purpose?.trim() ? body.purpose.trim() : undefined,
    };

    const visit = await this.prisma.visit.create({
      data,
      include: {
        contact: {
          select: { firstName: true, lastName: true, middleName: true },
        },
      },
    });
    return visit;
  }

  async getBacklog(actor: AuthUser | undefined): Promise<Prisma.VisitGetPayload<{ }>[]> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    return this.prisma.visit.findMany({
      where: {
        ownerId: actor.id,
        status: VisitStatusEnum.PLANNED_UNASSIGNED,
      },
      orderBy: { createdAt: "desc" },
      include: {
        contact: {
          select: { firstName: true, lastName: true, middleName: true },
        },
        company: {
          select: { id: true, name: true },
        },
      },
    });
  }

  async getById(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const visit = await this.prisma.visit.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true,
          },
        },
        company: {
          select: { id: true, name: true, phone: true },
        },
      },
    });
    if (!visit) {
      throw new NotFoundException("Visit not found");
    }
    await this.assertVisitAccess(visit, actor);
    return visit;
  }

  async getDay(dateStr: string, actor: AuthUser | undefined, requestedOwnerId?: string) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    const dayStart = date;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const ownerFilter = await buildVisitOwnerFilter(this.prisma, actor, requestedOwnerId);

    return this.prisma.visit.findMany({
      where: {
        ...(ownerFilter !== undefined ? { ownerId: ownerFilter } : {}),
        status: { in: [VisitStatusEnum.SCHEDULED, VisitStatusEnum.IN_PROGRESS, VisitStatusEnum.DONE] },
        startsAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { startsAt: "asc" },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        contact: { select: { firstName: true, lastName: true } },
        company: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, body: UpdateVisitInput, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const existing = await this.prisma.visit.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Visit not found");
    }

    await this.assertVisitAccess(existing, actor);

    const data: Prisma.VisitUpdateInput = {};

    if (body.title !== undefined) data.title = body.title;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.addressText !== undefined) data.addressText = body.addressText;
    if (body.lat !== undefined) data.lat = body.lat;
    if (body.lng !== undefined) data.lng = body.lng;
    if (body.locationSource !== undefined && body.locationSource !== null) {
      data.locationSource = body.locationSource;
    }

    if (body.durationMin !== undefined && body.durationMin !== null) {
      const value = Math.max(5, Math.trunc(body.durationMin));
      data.durationMin = value;
    }

    if (body.note !== undefined) {
      data.note = body.note;
    }
    if (body.purpose !== undefined) {
      data.purpose = body.purpose?.trim() ?? null;
    }

    // Determine next status and times
    let nextStatus = existing.status;
    if (body.status) {
      if (existing.status === VisitStatusEnum.DONE) {
        throw new BadRequestException("Cannot change status of a completed visit");
      }
      if (body.status === VisitStatusEnum.PLANNED_UNASSIGNED && existing.contactId) {
        const otherBacklog = await this.prisma.visit.findFirst({
          where: {
            ownerId: existing.ownerId,
            contactId: existing.contactId,
            status: VisitStatusEnum.PLANNED_UNASSIGNED,
            id: { not: id },
          },
          select: { id: true },
        });
        if (otherBacklog) {
          throw new BadRequestException(
            "У этого контакта уже есть визит в планах (backlog). Добавить второй нельзя.",
          );
        }
      }
      nextStatus = body.status;
      data.status = body.status;
    }

    const nextStartsAt = body.startsAt ?? existing.startsAt ?? null;
    const nextEndsAt = body.endsAt ?? existing.endsAt ?? null;

    if (body.startsAt !== undefined) data.startsAt = body.startsAt;
    if (body.endsAt !== undefined) data.endsAt = body.endsAt;

    // If visit becomes SCHEDULED and still has no coordinates, try to pull them from the contact
    const isBecomingScheduled = nextStatus === VisitStatusEnum.SCHEDULED;
    const hasCoordsInPayload = body.lat !== undefined || body.lng !== undefined;
    const hasExistingCoords = existing.lat != null && existing.lng != null;

    if (isBecomingScheduled && !hasCoordsInPayload && !hasExistingCoords && existing.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: existing.contactId },
        select: { lat: true, lng: true, address: true },
      });
      if (contact?.lat != null && contact?.lng != null) {
        data.lat = contact.lat;
        data.lng = contact.lng;
        if (data.addressText === undefined && existing.addressText == null && contact.address) {
          data.addressText = contact.address;
        }
        if (body.locationSource === undefined && existing.locationSource === LocationSourceEnum.NONE) {
          data.locationSource = LocationSourceEnum.FROM_CONTACT;
        }
      }
    }

    if (isBecomingScheduled && !hasCoordsInPayload && !hasExistingCoords && existing.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: existing.companyId },
        select: { lat: true, lng: true, address: true },
      });
      if (company?.lat != null && company?.lng != null) {
        data.lat = company.lat;
        data.lng = company.lng;
        if (data.addressText === undefined && existing.addressText == null && company.address) {
          data.addressText = company.address;
        }
      }
    }

    if (nextStatus === VisitStatusEnum.SCHEDULED) {
      const finalLat = (data.lat !== undefined ? data.lat : existing.lat) ?? null;
      const finalLng = (data.lng !== undefined ? data.lng : existing.lng) ?? null;
      if (finalLat == null || finalLng == null) {
        throw new BadRequestException(
          "Нельзя запланировать встречу: в карточке не заданы координаты (адрес/карта).",
        );
      }
      if (!nextStartsAt || !nextEndsAt) {
        throw new BadRequestException("startsAt and endsAt are required for SCHEDULED visits");
      }
      if ((existing.contactId || existing.companyId) && !existing.activityId) {
        try {
          const activity = await this.createVisitPlanActivity(existing, nextStartsAt, actor);
          if (activity?.id) {
            data.activity = { connect: { id: activity.id } };
          }
        } catch (err) {
          this.logger.warn(
            `Failed to create plan activity for visit ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }

    const updated = await this.prisma.visit.update({
      where: { id },
      data,
    });
    return updated;
  }

  async startVisit(id: string, actor: AuthUser | undefined, gpsPayload?: VisitGpsPayloadInput) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const existing = await this.prisma.visit.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Visit not found");
    }
    await this.assertVisitAccess(existing, actor);
    if (existing.status === VisitStatusEnum.DONE || existing.status === VisitStatusEnum.CANCELED) {
      throw new BadRequestException("Cannot start a completed or canceled visit");
    }
    const now = new Date();

    /** No geo payload → keep legacy web behaviour (no VisitGpsEvent / no verification fields). */
    if (gpsPayload === undefined) {
      return this.prisma.visit.update({
        where: { id },
        data: {
          status: VisitStatusEnum.IN_PROGRESS,
          startedAt: existing.startedAt ?? now,
        },
      });
    }

    const { verification, distanceToPlannedM } = verifyVisitAgainstPlannedLocation({
      visitLat: existing.lat,
      visitLng: existing.lng,
      radiusM: existing.radiusM,
      payload: gpsPayload,
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.persistVisitGpsLine(tx, {
        visitId: id,
        kind: VisitGpsEventKind.START,
        verification,
        distanceToPlannedM,
        payload: gpsPayload ?? null,
      });
      return tx.visit.update({
        where: { id },
        data: {
          status: VisitStatusEnum.IN_PROGRESS,
          startedAt: existing.startedAt ?? now,
          startGpsVerification: verification,
        },
      });
    });
    return updated;
  }

  async completeVisit(
    id: string,
    body: CompleteVisitInput,
    actor: AuthUser | undefined,
    gpsPayload?: VisitGpsPayloadInput,
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const existing = await this.prisma.visit.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Visit not found");
    }
    await this.assertVisitAccess(existing, actor);
    if (!body.resultNote || body.resultNote.trim() === "") {
      throw new BadRequestException("resultNote is required");
    }
    const validOutcomes = Object.values(VisitOutcomeEnum) as string[];
    if (!body.outcome || !validOutcomes.includes(body.outcome)) {
      throw new BadRequestException("Invalid outcome");
    }
    const outcomeValue = body.outcome as (typeof VisitOutcomeEnum)[keyof typeof VisitOutcomeEnum];
    const now = new Date();

    const completeDataBase = {
      status: VisitStatusEnum.DONE,
      completedAt: now,
      startedAt: existing.startedAt ?? now,
      outcome: outcomeValue,
      resultNote: body.resultNote.trim(),
      nextActionAt: body.nextActionAt ?? undefined,
      nextActionNote: body.nextActionNote?.trim() ?? undefined,
    } satisfies Prisma.VisitUpdateInput;

    const updated =
      gpsPayload === undefined
        ? await this.prisma.visit.update({
            where: { id },
            data: completeDataBase,
          })
        : await (async () => {
            const { verification, distanceToPlannedM } = verifyVisitAgainstPlannedLocation({
              visitLat: existing.lat,
              visitLng: existing.lng,
              radiusM: existing.radiusM,
              payload: gpsPayload,
            });
            return this.prisma.$transaction(async (tx) => {
              await this.persistVisitGpsLine(tx, {
                visitId: id,
                kind: VisitGpsEventKind.COMPLETE,
                verification,
                distanceToPlannedM,
                payload: gpsPayload,
              });
              return tx.visit.update({
                where: { id },
                data: {
                  ...completeDataBase,
                  completeGpsVerification: verification,
                },
              });
            });
          })();

    if (existing.contactId || existing.companyId) {
      try {
        await this.syncVisitResultActivity(existing, body, now, actor, id);
      } catch (err) {
        this.logger.warn(
          `Failed to create/update timeline activity for visit ${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const dayRef = updated.startsAt ?? updated.completedAt ?? now;
    const dateStr = new Date(dayRef).toISOString().slice(0, 10);
    void this.eventEmitter.emitAsync(VISIT_COMPLETED_EVENT, {
      ownerId: updated.ownerId,
      dateStr,
    });

    return updated;
  }

  async listHistory(
    q: {
      from?: string;
      to?: string;
      ownerId?: string;
      page?: number;
      pageSize?: number;
    },
    actor: AuthUser | undefined,
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const page = Math.max(1, Math.trunc(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(q.pageSize ?? 50)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.VisitWhereInput = {
      status: VisitStatusEnum.DONE,
      completedAt: { not: null },
    };

    if (q.from || q.to) {
      where.completedAt = {};
      if (q.from) {
        const d = new Date(q.from);
        if (!Number.isNaN(d.getTime())) (where.completedAt as Prisma.DateTimeFilter).gte = d;
      }
      if (q.to) {
        const d = new Date(q.to);
        if (!Number.isNaN(d.getTime())) (where.completedAt as Prisma.DateTimeFilter).lte = d;
      }
    }

    if (actor.role === UserRole.MANAGER || actor.role === UserRole.USER) {
      where.ownerId = actor.id;
    } else if (actor.role === UserRole.ADMIN) {
      if (q.ownerId) where.ownerId = q.ownerId;
    } else if (actor.role === UserRole.LEAD) {
      const team = await this.prisma.user.findMany({
        where: { leadId: actor.id },
        select: { id: true },
      });
      const allowedIds = new Set([actor.id, ...team.map((t) => t.id)]);
      if (q.ownerId) {
        if (!allowedIds.has(q.ownerId)) {
          throw new ForbiddenException("Cannot view this user's visit history");
        }
        where.ownerId = q.ownerId;
      } else {
        where.ownerId = { in: [...allowedIds] };
      }
    }

    const [total, items] = await this.prisma.$transaction([
      this.prisma.visit.count({ where }),
      this.prisma.visit.findMany({
        where,
        orderBy: { completedAt: "desc" },
        skip,
        take: pageSize,
        include: {
          owner: { select: { id: true, fullName: true, email: true } },
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          company: { select: { id: true, name: true, phone: true } },
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }
}

