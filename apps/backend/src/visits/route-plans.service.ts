import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import { resolveRouteGeometry, type RouteAnchorConfig } from "./route-geometry";
import { effectiveVisitLatLng } from "./visit-coordinates";

@Injectable()
export class RoutePlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async getGoogleMapsApiKey(): Promise<string | null> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { id: "google_maps" },
      select: { value: true },
    });
    if (!row?.value || typeof row.value !== "object") return null;
    const v = row.value as Record<string, unknown>;
    const key = typeof v.mapsApiKey === "string" ? v.mapsApiKey.trim() : "";
    return key || null;
  }

  /** Start/end anchors from user profile (Сотрудники → «Маршрут визитов»). */
  async getRouteAnchors(actorId: string): Promise<RouteAnchorConfig> {
    const u = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: {
        routeStartLat: true,
        routeStartLng: true,
        routeEndLat: true,
        routeEndLng: true,
        routeStartLabel: true,
        routeEndLabel: true,
      },
    });
    if (!u) {
      return {
        origin: null,
        destination: null,
        hasExplicitStart: false,
        hasExplicitEnd: false,
        startLabel: null,
        endLabel: null,
      };
    }
    const origin =
      u.routeStartLat != null && u.routeStartLng != null
        ? { lat: u.routeStartLat, lng: u.routeStartLng }
        : null;
    const endExplicit =
      u.routeEndLat != null && u.routeEndLng != null
        ? { lat: u.routeEndLat, lng: u.routeEndLng }
        : null;
    const hasExplicitStart = origin != null;
    const hasExplicitEnd = endExplicit != null;
    const destination = endExplicit ?? origin;
    return {
      origin,
      destination,
      hasExplicitStart,
      hasExplicitEnd,
      startLabel: u.routeStartLabel ?? null,
      endLabel: u.routeEndLabel ?? null,
    };
  }

  private buildRoutingPreference(traffic: boolean): "TRAFFIC_AWARE" | "TRAFFIC_UNAWARE" {
    return traffic ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE";
  }

  private async computeRouteByGoogle(opts: {
    origin: { lat: number; lng: number };
    destination: { lat: number; lng: number };
    intermediates: Array<{ lat: number; lng: number }>;
    traffic: boolean;
    optimize?: boolean;
  }): Promise<
    | {
        distanceKm: number | null;
        durationMin: number | null;
        optimizedIntermediateIndexes?: number[];
      }
    | null
  > {
    const key = await this.getGoogleMapsApiKey();
    if (!key) return null;
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.optimizedIntermediateWaypointIndex",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: opts.origin.lat, longitude: opts.origin.lng } } },
        destination: {
          location: { latLng: { latitude: opts.destination.lat, longitude: opts.destination.lng } },
        },
        intermediates: opts.intermediates.map((p) => ({
          location: { latLng: { latitude: p.lat, longitude: p.lng } },
        })),
        travelMode: "DRIVE",
        routingPreference: this.buildRoutingPreference(opts.traffic),
        computeAlternativeRoutes: false,
        ...(opts.optimize ? { optimizeWaypointOrder: true } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        optimizedIntermediateWaypointIndex?: number[];
      }>;
    };
    const r = data.routes?.[0];
    const distM = typeof r?.distanceMeters === "number" ? r.distanceMeters : null;
    const dur = typeof r?.duration === "string" ? r.duration : null; // "1234s"
    const durationSec = dur && /^\d+s$/.test(dur) ? Number(dur.replace("s", "")) : null;
    const optimized =
      Array.isArray(r?.optimizedIntermediateWaypointIndex) &&
      r!.optimizedIntermediateWaypointIndex!.every((x) => typeof x === "number")
        ? (r!.optimizedIntermediateWaypointIndex as number[])
        : undefined;
    return {
      distanceKm: distM != null ? Math.round((distM / 1000) * 10) / 10 : null,
      durationMin: durationSec != null ? Math.round(durationSec / 60) : null,
      ...(optimized ? { optimizedIntermediateIndexes: optimized } : {}),
    };
  }

  async getRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: { traffic?: boolean },
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const date = this.parseDate(dateStr);

    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId: actor.id, date } },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: {
            visit: {
              include: {
                contact: { select: { lat: true, lng: true } },
                company: { select: { lat: true, lng: true } },
              },
            },
          },
        },
      },
    });
    if (!plan?.stops?.length) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }
    const stopsWithCoords = plan.stops
      .map((s) => ({ stop: s, coords: effectiveVisitLatLng(s.visit) }))
      .filter((x): x is { stop: (typeof plan.stops)[0]; coords: { lat: number; lng: number } } => x.coords != null);
    if (stopsWithCoords.length !== plan.stops.length || stopsWithCoords.length === 0) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }

    const anchors = await this.getRouteAnchors(actor.id);
    const visitPoints = stopsWithCoords.map((x) => x.coords);
    const { origin, destination, intermediates } = resolveRouteGeometry(visitPoints, anchors);

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (google) {
        return {
          distanceKm: google.distanceKm,
          durationMin: google.durationMin,
          source: "google",
        };
      }
    } catch {
      // fall through
    }

    // Fallback: straight-line sum (useful when API key is missing/restricted)
    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    return { distanceKm: Math.round(km * 10) / 10, durationMin: null, source: "fallback" };
  }

  private haversineKm(
    oLat: number,
    oLng: number,
    intermediates: Array<{ lat: number | null; lng: number | null }>,
    dLat: number,
    dLng: number,
  ): number {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371;
    const legs: Array<{ lat: number; lng: number }> = [
      { lat: oLat, lng: oLng },
      ...intermediates
        .filter((p): p is { lat: number; lng: number } => p.lat != null && p.lng != null)
        .map((p) => ({ lat: p.lat, lng: p.lng })),
      { lat: dLat, lng: dLng },
    ];
    let total = 0;
    for (let i = 0; i < legs.length - 1; i++) {
      const a = legs[i]!;
      const b = legs[i + 1]!;
      const dLatR = toRad(b.lat - a.lat);
      const dLngR = toRad(b.lng - a.lng);
      const sa =
        Math.sin(dLatR / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLngR / 2) ** 2;
      total += 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
    }
    return total;
  }

  async previewRouteMetrics(
    dateStr: string,
    visitIds: string[],
    actor: AuthUser | undefined,
    opts?: { traffic?: boolean },
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    if (!Array.isArray(visitIds) || visitIds.length === 0) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }
    const cleaned = visitIds.map((x) => String(x)).filter(Boolean);
    const unique = Array.from(new Set(cleaned));
    if (unique.length === 0) return { distanceKm: null, durationMin: null, source: "none" };

    // Load visits in bulk; preserve requested order
    const visits = await this.prisma.visit.findMany({
      where: { ownerId: actor.id, id: { in: unique } },
      select: {
        id: true,
        lat: true,
        lng: true,
        contact: { select: { lat: true, lng: true } },
        company: { select: { lat: true, lng: true } },
      },
    });
    const byId = new Map(visits.map((v) => [v.id, v]));
    const ordered = unique
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((v) => ({ id: v!.id, coords: effectiveVisitLatLng(v!) }))
      .filter((x): x is { id: string; coords: { lat: number; lng: number } } => x.coords != null);
    if (ordered.length === 0) return { distanceKm: null, durationMin: null, source: "none" };
    if (ordered.length !== unique.length) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }

    const anchors = await this.getRouteAnchors(actor.id);
    const visitPoints = ordered.map((v) => v.coords);
    const { origin, destination, intermediates } = resolveRouteGeometry(visitPoints, anchors);

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (google) {
        return { distanceKm: google.distanceKm, durationMin: google.durationMin, source: "google" };
      }
    } catch {
      // fall through
    }

    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    return { distanceKm: Math.round(km * 10) / 10, durationMin: null, source: "fallback" };
  }

  async optimizeRouteOrder(
    dateStr: string,
    visitIds: string[],
    actor: AuthUser | undefined,
    opts?: { traffic?: boolean },
  ): Promise<{ visitIds: string[]; source: "google" | "fallback" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    if (!Array.isArray(visitIds) || visitIds.length < 2) {
      return { visitIds: Array.isArray(visitIds) ? visitIds.map(String) : [], source: "fallback" };
    }
    const cleaned = visitIds.map((x) => String(x)).filter(Boolean);
    const unique = Array.from(new Set(cleaned));
    if (unique.length < 2) return { visitIds: unique, source: "fallback" };

    const visits = await this.prisma.visit.findMany({
      where: { ownerId: actor.id, id: { in: unique } },
      select: {
        id: true,
        lat: true,
        lng: true,
        contact: { select: { lat: true, lng: true } },
        company: { select: { lat: true, lng: true } },
      },
    });
    const byId = new Map(visits.map((v) => [v.id, v]));
    const ordered = unique
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((v) => ({ id: v!.id, coords: effectiveVisitLatLng(v!) }))
      .filter((x): x is { id: string; coords: { lat: number; lng: number } } => x.coords != null);
    if (ordered.length < 2 || ordered.length !== unique.length) {
      return { visitIds: unique, source: "fallback" };
    }

    const anchors = await this.getRouteAnchors(actor.id);
    const visitPoints = ordered.map((v) => v.coords);
    const { origin, destination, usesSettingsAnchors } = resolveRouteGeometry(visitPoints, anchors);

    const intermediatesForOptimize = usesSettingsAnchors
      ? ordered
      : ordered.slice(1, -1);

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates: intermediatesForOptimize.map((v) => v.coords),
        traffic: opts?.traffic === true,
        optimize: true,
      });
      if (google?.optimizedIntermediateIndexes) {
        const perm = google.optimizedIntermediateIndexes;
        const reordered = perm.map((i) => intermediatesForOptimize[i]).filter(Boolean) as typeof ordered;
        const result = usesSettingsAnchors
          ? reordered.map((v) => v.id)
          : [ordered[0]!.id, ...reordered.map((v) => v.id), ordered[ordered.length - 1]!.id];
        return { visitIds: result, source: "google" };
      }
    } catch {
      // fall back
    }

    const start = usesSettingsAnchors ? intermediatesForOptimize[0]! : ordered[0]!;
    const fixedLast = usesSettingsAnchors ? null : ordered[ordered.length - 1]!;
    const pool = new Map(intermediatesForOptimize.map((v) => [v.id, v]));
    const path: typeof ordered = [];
    let cur = start;
    while (pool.size > 0) {
      if (pool.has(cur.id)) {
        path.push(cur);
        pool.delete(cur.id);
      }
      if (pool.size === 0) break;
      let best: typeof cur | null = null;
      let bestD = Infinity;
      for (const v of pool.values()) {
        const d = this.haversineKm(
          cur.coords.lat,
          cur.coords.lng,
          [],
          v.coords.lat,
          v.coords.lng,
        );
        if (d < bestD) {
          bestD = d;
          best = v;
        }
      }
      cur = best ?? Array.from(pool.values())[0]!;
    }
    const ids = usesSettingsAnchors
      ? path.map((v) => v.id)
      : [
          ordered[0]!.id,
          ...path.map((v) => v.id).filter((id) => id !== ordered[0]!.id && id !== fixedLast!.id),
          fixedLast!.id,
        ];
    return { visitIds: ids, source: "fallback" };
  }

  async getFactRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: { traffic?: boolean },
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const date = this.parseDate(dateStr);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // "Факт" = порядок завершения визитов за день (если completedAt нет — fallback на endsAt/startsAt).
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId: actor.id,
        status: "DONE",
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        completedAt: true,
        endsAt: true,
        startsAt: true,
        contact: { select: { lat: true, lng: true } },
        company: { select: { lat: true, lng: true } },
      },
      orderBy: [{ completedAt: "asc" }, { endsAt: "asc" }, { startsAt: "asc" }],
    });
    const ordered = done
      .map((v) => ({ visit: v, coords: effectiveVisitLatLng(v) }))
      .filter((x): x is { visit: (typeof done)[0]; coords: { lat: number; lng: number } } => x.coords != null);
    if (ordered.length < 2) return { distanceKm: null, durationMin: null, source: "none" };

    const anchors = await this.getRouteAnchors(actor.id);
    const visitPoints = ordered.map((x) => x.coords);
    const { origin, destination, intermediates } = resolveRouteGeometry(visitPoints, anchors);

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (google) return { distanceKm: google.distanceKm, durationMin: google.durationMin, source: "google" };
    } catch {
      // fall through
    }

    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    return { distanceKm: Math.round(km * 10) / 10, durationMin: null, source: "fallback" };
  }

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
        include: {
          contact: { select: { lat: true, lng: true } },
          company: { select: { lat: true, lng: true } },
        },
      });
      if (!visit) {
        throw new BadRequestException("Visit not found");
      }
      const coords = effectiveVisitLatLng(visit);
      if (!coords) {
        throw new BadRequestException("Visit has no coordinates (lat/lng)");
      }
      const anchors = await this.getRouteAnchors(actor.id);
      if (anchors.hasExplicitStart && anchors.origin) {
        return {
          url: `https://www.google.com/maps/dir/?api=1&origin=${anchors.origin.lat},${anchors.origin.lng}&destination=${coords.lat},${coords.lng}`,
        };
      }
      const url = `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`;
      return { url };
    }

    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: { ownerId: actor.id, date },
      },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: {
            visit: {
              include: {
                contact: { select: { lat: true, lng: true } },
                company: { select: { lat: true, lng: true } },
              },
            },
          },
        },
      },
    });
    if (!plan?.stops?.length) {
      throw new BadRequestException("No route plan for this date");
    }
    const points = plan.stops
      .map((s) => effectiveVisitLatLng(s.visit))
      .filter((c): c is { lat: number; lng: number } => c != null);
    if (points.length !== plan.stops.length) {
      throw new BadRequestException(
        "Some visits in the route have no coordinates (lat/lng)",
      );
    }
    if (points.length === 0) {
      throw new BadRequestException("No visits with coordinates in route");
    }

    const anchors = await this.getRouteAnchors(actor.id);
    if ((anchors.hasExplicitStart || anchors.hasExplicitEnd) && anchors.origin && anchors.destination) {
      const wp = points.map((v) => `${v.lat},${v.lng}`).join("|");
      const dest = anchors.destination;
      const orig = anchors.origin;
      return {
        url: `https://www.google.com/maps/dir/?api=1&origin=${orig.lat},${orig.lng}&destination=${dest.lat},${dest.lng}&waypoints=${encodeURIComponent(wp)}`,
      };
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

