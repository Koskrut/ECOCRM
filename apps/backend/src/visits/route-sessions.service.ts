import { BadRequestException, Injectable } from "@nestjs/common";
import { VisitStatus } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";

export type RouteSessionState = {
  session: {
    id: string;
    ownerId: string;
    date: Date;
    routePlanId: string | null;
    isActive: boolean;
    currentVisitId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  currentVisit: Record<string, unknown> | null;
  routePlan: {
    id: string;
    stops: Array<{ id: string; position: number; visitId: string; visit: Record<string, unknown> }>;
  } | null;
};

@Injectable()
export class RouteSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(dateStr: string): Date {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  private getDayRange(date: Date): { dayStart: Date; dayEnd: Date } {
    const dayStart = date;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    return { dayStart, dayEnd };
  }

  /** First non-DONE visit: from RoutePlan by position, else by startsAt (>= now then min startsAt). */
  private async resolveFirstVisitId(
    ownerId: string,
    date: Date,
  ): Promise<string | null> {
    const { dayStart, dayEnd } = this.getDayRange(date);
    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: { ownerId, date },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: { select: { id: true, status: true } } },
        },
      },
    });
    if (plan?.stops?.length) {
      const firstNotDone = plan.stops.find(
        (s) => s.visit.status !== VisitStatus.DONE,
      );
      if (firstNotDone) return firstNotDone.visit.id;
      return null;
    }
    const now = new Date();
    const visits = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: { notIn: [VisitStatus.DONE, VisitStatus.CANCELED] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    });
    const futureOrNow = visits.filter((v) => v.startsAt && v.startsAt >= now);
    const first = futureOrNow[0] ?? visits[0];
    return first?.id ?? null;
  }

  /** Next non-DONE visit after currentVisitId: from RoutePlan order, else by startsAt. */
  private async resolveNextVisitId(
    ownerId: string,
    date: Date,
    currentVisitId: string | null,
  ): Promise<string | null> {
    const { dayStart, dayEnd } = this.getDayRange(date);
    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: { ownerId, date },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: { select: { id: true, status: true } } },
        },
      },
    });
    if (plan?.stops?.length) {
      const notDone = plan.stops.filter(
        (s) => s.visit.status !== VisitStatus.DONE,
      );
      if (!currentVisitId) return notDone[0]?.visit.id ?? null;
      const idx = notDone.findIndex((s) => s.visit.id === currentVisitId);
      if (idx === -1) return notDone[0]?.visit.id ?? null;
      return notDone[idx + 1]?.visit.id ?? null;
    }
    const visits = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: { notIn: [VisitStatus.DONE, VisitStatus.CANCELED] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    });
    const now = new Date();
    const futureOrNow = visits.filter((v) => v.startsAt && v.startsAt >= now);
    const list = futureOrNow.length ? futureOrNow : visits;
    if (!currentVisitId) return list[0]?.id ?? null;
    const idx = list.findIndex((v) => v.id === currentVisitId);
    if (idx === -1) return list[0]?.id ?? null;
    return list[idx + 1]?.id ?? null;
  }

  private async toState(session: {
    id: string;
    ownerId: string;
    date: Date;
    routePlanId: string | null;
    isActive: boolean;
    currentVisitId: string | null;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    currentVisit?: unknown;
    routePlan?: unknown;
  }): Promise<RouteSessionState> {
    const currentVisit = session.currentVisitId
      ? await this.prisma.visit.findUnique({
          where: { id: session.currentVisitId },
        })
      : null;
    const routePlan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: { ownerId: session.ownerId, date: session.date },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: true },
        },
      },
    });
    return {
      session: {
        id: session.id,
        ownerId: session.ownerId,
        date: session.date,
        routePlanId: session.routePlanId,
        isActive: session.isActive,
        currentVisitId: session.currentVisitId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      currentVisit: currentVisit ?? null,
      routePlan: routePlan
        ? {
            id: routePlan.id,
            stops: routePlan.stops.map((s) => ({
              id: s.id,
              position: s.position,
              visitId: s.visitId,
              visit: s.visit,
            })),
          }
        : null,
    };
  }

  async get(dateStr: string, actor: AuthUser | undefined): Promise<RouteSessionState | null> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = this.parseDate(dateStr);
    const session = await this.prisma.routeSession.findUnique({
      where: {
        ownerId_date: { ownerId: actor.id, date },
      },
    });
    if (!session) return null;
    return this.toState(session);
  }

  async start(dateStr: string, actor: AuthUser | undefined): Promise<RouteSessionState> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = this.parseDate(dateStr);
    const firstVisitId = await this.resolveFirstVisitId(actor.id, date);
    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId: actor.id, date } },
    });
    const session = await this.prisma.routeSession.upsert({
      where: {
        ownerId_date: { ownerId: actor.id, date },
      },
      create: {
        ownerId: actor.id,
        date,
        routePlanId: plan?.id ?? null,
        isActive: true,
        currentVisitId: firstVisitId,
      },
      update: {
        isActive: true,
        currentVisitId: firstVisitId,
        endedAt: null,
      },
    });
    return this.toState(session);
  }

  async stop(dateStr: string, actor: AuthUser | undefined): Promise<RouteSessionState | null> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = this.parseDate(dateStr);
    const session = await this.prisma.routeSession.findUnique({
      where: { ownerId_date: { ownerId: actor.id, date } },
    });
    if (!session) return null;
    const now = new Date();
    const updated = await this.prisma.routeSession.update({
      where: { id: session.id },
      data: { isActive: false, endedAt: now },
    });
    return this.toState(updated);
  }

  async next(dateStr: string, actor: AuthUser | undefined): Promise<RouteSessionState> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = this.parseDate(dateStr);
    const session = await this.prisma.routeSession.findUnique({
      where: { ownerId_date: { ownerId: actor.id, date } },
    });
    if (!session) {
      return this.start(dateStr, actor);
    }
    const nextVisitId = await this.resolveNextVisitId(
      actor.id,
      date,
      session.currentVisitId,
    );
    const updated = await this.prisma.routeSession.update({
      where: { id: session.id },
      data: { currentVisitId: nextVisitId },
    });
    return this.toState(updated);
  }
}
