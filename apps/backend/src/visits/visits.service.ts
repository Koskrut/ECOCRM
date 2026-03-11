import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { LocationSource, Prisma, VisitStatus } from "@prisma/client";
import {
  UserRole,
  VisitStatus as VisitStatusEnum,
  VisitOutcome as VisitOutcomeEnum,
  LocationSource as LocationSourceEnum,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { ActivitiesService } from "../activities/activities.service";
import { PrismaService } from "../prisma/prisma.service";

type CreateVisitInput = {
  contactId?: string | null;
  companyId?: string | null;
  title?: string | null;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
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
  ) {}

  private assertVisitAccess(visit: { ownerId: string }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && visit.ownerId && visit.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access your own visits");
    }
  }

  async create(body: CreateVisitInput, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }

    const ownerId = actor.id;
    const contactId = body.contactId ?? null;
    const companyId = body.companyId ?? null;

    let contact: { id: string; phone: string | null; address: string | null } | null = null;
    if (contactId) {
      contact = await this.prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, phone: true, address: true },
      });
      if (!contact) {
        throw new NotFoundException("Contact not found");
      }
    }

    if (companyId) {
      const companyExists = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true },
      });
      if (!companyExists) {
        throw new NotFoundException("Company not found");
      }
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

    const data: Prisma.VisitCreateInput = {
      owner: { connect: { id: ownerId } },
      contact: contactId ? { connect: { id: contactId } } : undefined,
      company: companyId ? { connect: { id: companyId } } : undefined,
      title: body.title ?? undefined,
      phone: phone ?? undefined,
      addressText: addressText ?? undefined,
      lat: body.lat ?? undefined,
      lng: body.lng ?? undefined,
      locationSource: locationSource ?? LocationSourceEnum.NONE,
      status: VisitStatusEnum.PLANNED_UNASSIGNED,
    };

    const visit = await this.prisma.visit.create({ data });
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
    });
  }

  async getDay(dateStr: string, actor: AuthUser | undefined) {
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

    return this.prisma.visit.findMany({
      where: {
        ownerId: actor.id,
        status: { in: [VisitStatusEnum.SCHEDULED, VisitStatusEnum.IN_PROGRESS, VisitStatusEnum.DONE] },
        startsAt: {
          gte: dayStart,
          lt: dayEnd,
        },
      },
      orderBy: { startsAt: "asc" },
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

    this.assertVisitAccess(existing, actor);

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

    if (nextStatus === VisitStatusEnum.SCHEDULED) {
      if (!nextStartsAt || !nextEndsAt) {
        throw new BadRequestException("startsAt and endsAt are required for SCHEDULED visits");
      }
      if (existing.contactId && !existing.activityId) {
        try {
          const planOccurredAt = nextStartsAt ?? new Date();
          const planBody =
            planOccurredAt instanceof Date
              ? `Запланирована на ${planOccurredAt.toLocaleString("uk-UA")}`
              : "Запланирована";
          const activity = await this.activitiesService.createForContact(
            existing.contactId,
            {
              type: "MEETING",
              title: "Встреча (план)",
              body: planBody,
              occurredAt: (nextStartsAt ?? planOccurredAt) instanceof Date
                ? (nextStartsAt ?? planOccurredAt).toISOString()
                : undefined,
            },
            actor,
          );
          data.activity = { connect: { id: activity.id } };
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

  async startVisit(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const existing = await this.prisma.visit.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Visit not found");
    }
    this.assertVisitAccess(existing, actor);
    if (existing.status === VisitStatusEnum.DONE || existing.status === VisitStatusEnum.CANCELED) {
      throw new BadRequestException("Cannot start a completed or canceled visit");
    }
    const now = new Date();
    return this.prisma.visit.update({
      where: { id },
      data: {
        status: VisitStatusEnum.IN_PROGRESS,
        startedAt: existing.startedAt ?? now,
      },
    });
  }

  async completeVisit(id: string, body: CompleteVisitInput, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const existing = await this.prisma.visit.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException("Visit not found");
    }
    this.assertVisitAccess(existing, actor);
    if (!body.resultNote || body.resultNote.trim() === "") {
      throw new BadRequestException("resultNote is required");
    }
    const validOutcomes = Object.values(VisitOutcomeEnum) as string[];
    if (!body.outcome || !validOutcomes.includes(body.outcome)) {
      throw new BadRequestException("Invalid outcome");
    }
    const outcomeValue = body.outcome as (typeof VisitOutcomeEnum)[keyof typeof VisitOutcomeEnum];
    const now = new Date();
    const updated = await this.prisma.visit.update({
      where: { id },
      data: {
        status: VisitStatusEnum.DONE,
        completedAt: now,
        startedAt: existing.startedAt ?? now,
        outcome: outcomeValue,
        resultNote: body.resultNote.trim(),
        nextActionAt: body.nextActionAt ?? undefined,
        nextActionNote: body.nextActionNote?.trim() ?? undefined,
      },
    });

    if (existing.contactId) {
      try {
        const activityBody = body.resultNote.trim();
        const activityTitle = `Встреча (${body.outcome})`;
        if (existing.activityId) {
          await this.prisma.activity.update({
            where: { id: existing.activityId },
            data: {
              title: activityTitle,
              body: activityBody,
              occurredAt: now,
            },
          });
        } else {
          await this.activitiesService.createForContact(
            existing.contactId,
            {
              type: "MEETING",
              title: activityTitle,
              body: activityBody,
              occurredAt: now.toISOString(),
            },
            actor,
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to create/update contact timeline activity for visit ${id}, contact ${existing.contactId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return updated;
  }
}

