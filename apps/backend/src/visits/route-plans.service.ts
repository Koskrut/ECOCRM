import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";

@Injectable()
export class RoutePlansService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(dateStr: string): Date {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  async getForDay(dateStr: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const date = this.parseDate(dateStr);
    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: {
          ownerId: actor.id,
          date,
        },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: true },
        },
      },
    });
    return plan ?? null;
  }

  async upsertForDay(dateStr: string, visitIds: string[], actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    if (!Array.isArray(visitIds)) {
      throw new BadRequestException("visitIds must be an array");
    }
    const cleanedIds = visitIds.map((id) => String(id)).filter((id) => id.length > 0);
    const uniqueIds = Array.from(new Set(cleanedIds));

    const date = this.parseDate(dateStr);

    const plan = await this.prisma.routePlan.upsert({
      where: {
        ownerId_date: {
          ownerId: actor.id,
          date,
        },
      },
      create: {
        owner: { connect: { id: actor.id } },
        date,
      },
      update: {},
    });

    // перезаписываем остановки
    await this.prisma.routeStop.deleteMany({
      where: { routePlanId: plan.id },
    });

    if (uniqueIds.length > 0) {
      const stopsData: Prisma.RouteStopCreateManyInput[] = uniqueIds.map((visitId, index) => ({
        routePlanId: plan.id,
        visitId,
        position: index + 1,
      }));
      await this.prisma.routeStop.createMany({
        data: stopsData,
        skipDuplicates: true,
      });
    }

    const result = await this.prisma.routePlan.findUnique({
      where: { id: plan.id },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: true },
        },
      },
    });
    return result;
  }

  async getNavigationUrl(
    dateStr: string,
    mode: "single" | "multi",
    visitId: string | undefined,
    actor: AuthUser | undefined,
  ): Promise<{ url: string }> {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    if (mode !== "single" && mode !== "multi") {
      throw new BadRequestException("mode must be single or multi");
    }
    const date = this.parseDate(dateStr);

    if (mode === "single") {
      if (!visitId) {
        throw new BadRequestException("visitId is required for single mode");
      }
      const visit = await this.prisma.visit.findFirst({
        where: { id: visitId, ownerId: actor.id },
      });
      if (!visit) {
        throw new BadRequestException("Visit not found");
      }
      if (visit.lat == null || visit.lng == null) {
        throw new BadRequestException("Visit has no coordinates (lat/lng)");
      }
      const url = `https://www.google.com/maps/dir/?api=1&destination=${visit.lat},${visit.lng}`;
      return { url };
    }

    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: { ownerId: actor.id, date },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: { visit: true },
        },
      },
    });
    if (!plan?.stops?.length) {
      throw new BadRequestException("No route plan for this date");
    }
    const points = plan.stops
      .map((s) => s.visit)
      .filter((v) => v.lat != null && v.lng != null);
    if (points.length !== plan.stops.length) {
      throw new BadRequestException(
        "Some visits in the route have no coordinates (lat/lng)",
      );
    }
    if (points.length === 0) {
      throw new BadRequestException("No visits with coordinates in route");
    }
    if (points.length === 1) {
      const v = points[0]!;
      return {
        url: `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lng}`,
      };
    }
    const waypoints = points.slice(0, -1).map((v) => `${v.lat},${v.lng}`).join("|");
    const last = points[points.length - 1]!;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${last.lat},${last.lng}&waypoints=${encodeURIComponent(waypoints)}`;
    return { url };
  }
}

