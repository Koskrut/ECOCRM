import { BadRequestException, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import { resolveRouteGeometry, type LatLng, type RouteAnchorConfig } from "./route-geometry";
import { decodeEncodedPolyline, pathFromWaypoints } from "./polyline.util";
import type {
  RouteGeometryBundle,
  RouteGeometryKind,
  RouteGeometryResult,
  RouteGeometryWaypoint,
} from "./route-geometry.types";
import { effectiveVisitLatLng } from "./visit-coordinates";
import { resolveSingleOwnerId } from "./visits-owner-scope";

export type RoutePlanScopeOpts = { traffic?: boolean; ownerId?: string };

@Injectable()
export class RoutePlansService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveOwner(actor: AuthUser, requestedOwnerId?: string): Promise<string> {
    return resolveSingleOwnerId(this.prisma, actor, requestedOwnerId);
  }

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
  }  ): Promise<
    | {
        distanceKm: number | null;
        durationMin: number | null;
        encodedPolyline?: string | null;
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
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex",
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
        polyline?: { encodedPolyline?: string };
        optimizedIntermediateWaypointIndex?: number[];
      }>;
    };
    const r = data.routes?.[0];
    const distM = typeof r?.distanceMeters === "number" ? r.distanceMeters : null;
    const dur = typeof r?.duration === "string" ? r.duration : null; // "1234s"
    const durationSec = dur && /^\d+s$/.test(dur) ? Number(dur.replace("s", "")) : null;
    const encoded =
      typeof r?.polyline?.encodedPolyline === "string" ? r.polyline.encodedPolyline : null;
    const optimized =
      Array.isArray(r?.optimizedIntermediateWaypointIndex) &&
      r!.optimizedIntermediateWaypointIndex!.every((x) => typeof x === "number")
        ? (r!.optimizedIntermediateWaypointIndex as number[])
        : undefined;
    return {
      distanceKm: distM != null ? Math.round((distM / 1000) * 10) / 10 : null,
      durationMin: durationSec != null ? Math.round(durationSec / 60) : null,
      encodedPolyline: encoded,
      ...(optimized ? { optimizedIntermediateIndexes: optimized } : {}),
    };
  }

  async getRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    const date = this.parseDate(dateStr);

    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId, date } },
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

    const anchors = await this.getRouteAnchors(ownerId);
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
    opts?: RoutePlanScopeOpts,
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    if (!Array.isArray(visitIds) || visitIds.length === 0) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }
    const cleaned = visitIds.map((x) => String(x)).filter(Boolean);
    const unique = Array.from(new Set(cleaned));
    if (unique.length === 0) return { distanceKm: null, durationMin: null, source: "none" };

    // Load visits in bulk; preserve requested order
    const visits = await this.prisma.visit.findMany({
      where: { ownerId, id: { in: unique } },
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

    const anchors = await this.getRouteAnchors(ownerId);
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
    opts?: RoutePlanScopeOpts,
  ): Promise<{ visitIds: string[]; source: "google" | "fallback" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    if (!Array.isArray(visitIds) || visitIds.length < 2) {
      return { visitIds: Array.isArray(visitIds) ? visitIds.map(String) : [], source: "fallback" };
    }
    const cleaned = visitIds.map((x) => String(x)).filter(Boolean);
    const unique = Array.from(new Set(cleaned));
    if (unique.length < 2) return { visitIds: unique, source: "fallback" };

    const visits = await this.prisma.visit.findMany({
      where: { ownerId, id: { in: unique } },
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

    const anchors = await this.getRouteAnchors(ownerId);
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
    opts?: RoutePlanScopeOpts,
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "google" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    const date = this.parseDate(dateStr);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    // "Факт" = порядок завершения визитов за день (если completedAt нет — fallback на endsAt/startsAt).
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
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

    const anchors = await this.getRouteAnchors(ownerId);
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

  async getForDay(dateStr: string, actor: AuthUser | undefined, requestedOwnerId?: string) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    const ownerId = await this.resolveOwner(actor, requestedOwnerId);
    const date = this.parseDate(dateStr);
    const plan = await this.prisma.routePlan.findUnique({
      where: {
        ownerId_date: {
          ownerId,
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

  async upsertForDay(
    dateStr: string,
    visitIds: string[],
    actor: AuthUser | undefined,
    requestedOwnerId?: string,
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    if (!dateStr) {
      throw new BadRequestException("date is required");
    }
    if (!Array.isArray(visitIds)) {
      throw new BadRequestException("visitIds must be an array");
    }
    const ownerId = await this.resolveOwner(actor, requestedOwnerId);
    const cleanedIds = visitIds.map((id) => String(id)).filter((id) => id.length > 0);
    const uniqueIds = Array.from(new Set(cleanedIds));

    const date = this.parseDate(dateStr);

    const plan = await this.prisma.routePlan.upsert({
      where: {
        ownerId_date: {
          ownerId,
          date,
        },
      },
      create: {
        owner: { connect: { id: ownerId } },
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

    await this.prisma.routeSession.updateMany({
      where: { ownerId, date, isActive: true },
      data: { routePlanId: plan.id },
    });

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
    requestedOwnerId?: string,
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
    const ownerId = await this.resolveOwner(actor, requestedOwnerId);
    const date = this.parseDate(dateStr);

    if (mode === "single") {
      if (!visitId) {
        throw new BadRequestException("visitId is required for single mode");
      }
      const visit = await this.prisma.visit.findFirst({
        where: { id: visitId, ownerId },
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
      const anchors = await this.getRouteAnchors(ownerId);
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
        ownerId_date: { ownerId, date },
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

    const anchors = await this.getRouteAnchors(ownerId);
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

  private emptyGeometry(kind: RouteGeometryKind, reason: string): RouteGeometryResult {
    return {
      kind,
      source: "none",
      distanceKm: null,
      durationMin: null,
      path: [],
      encodedPolyline: null,
      waypoints: [],
      quality: {
        sampleCount: 0,
        coverageRatio: null,
        degraded: true,
        degradedReason: reason,
      },
    };
  }

  private downsamplePath(path: LatLng[], maxPoints = 400): LatLng[] {
    if (path.length <= maxPoints) return path;
    const step = Math.ceil(path.length / maxPoints);
    const out: LatLng[] = [];
    for (let i = 0; i < path.length; i += step) {
      out.push(path[i]!);
    }
    const last = path[path.length - 1]!;
    const tail = out[out.length - 1];
    if (!tail || tail.lat !== last.lat || tail.lng !== last.lng) {
      out.push(last);
    }
    return out;
  }

  /** Chronological GPS track → drivable path (Google Routes, up to 25 via-points). */
  async snapGpsPathToRoads(
    points: LatLng[],
    opts?: { traffic?: boolean },
  ): Promise<{ path: LatLng[]; source: "google" | "fallback" | "none"; distanceKm: number | null }> {
    if (points.length < 2) {
      return { path: [], source: "none", distanceKm: null };
    }

    const sampled = this.downsamplePath(points, 25);
    if (sampled.length < 2) {
      return { path: points, source: "fallback", distanceKm: this.pathDistanceKm(points) };
    }

    const origin = sampled[0]!;
    const destination = sampled[sampled.length - 1]!;
    const intermediates = sampled.length > 2 ? sampled.slice(1, -1) : [];

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (google?.encodedPolyline) {
        return {
          path: decodeEncodedPolyline(google.encodedPolyline),
          source: "google",
          distanceKm: google.distanceKm,
        };
      }
      if (google) {
        return {
          path: pathFromWaypoints(origin, intermediates, destination),
          source: "fallback",
          distanceKm: google.distanceKm,
        };
      }
    } catch {
      // fall through
    }

    return {
      path: points,
      source: "fallback",
      distanceKm: this.pathDistanceKm(points),
    };
  }

  private async buildRoutedGeometry(opts: {
    kind: RouteGeometryKind;
    visitPoints: LatLng[];
    waypoints: RouteGeometryWaypoint[];
    ownerId: string;
    traffic: boolean;
  }): Promise<RouteGeometryResult> {
    const { kind, visitPoints, waypoints, ownerId, traffic } = opts;
    if (visitPoints.length === 0) {
      return this.emptyGeometry(kind, "no_points");
    }

    const anchors = await this.getRouteAnchors(ownerId);
    const { origin, destination, intermediates } = resolveRouteGeometry(visitPoints, anchors);

    try {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic,
      });
      if (google?.encodedPolyline) {
        const path = decodeEncodedPolyline(google.encodedPolyline);
        return {
          kind,
          source: "google",
          distanceKm: google.distanceKm,
          durationMin: google.durationMin,
          path,
          encodedPolyline: google.encodedPolyline,
          waypoints,
          quality: {
            sampleCount: waypoints.length,
            coverageRatio: null,
            degraded: false,
            degradedReason: null,
          },
        };
      }
      if (google) {
        const path = pathFromWaypoints(origin, intermediates, destination);
        return {
          kind,
          source: "google",
          distanceKm: google.distanceKm,
          durationMin: google.durationMin,
          path,
          encodedPolyline: null,
          waypoints,
          quality: {
            sampleCount: waypoints.length,
            coverageRatio: null,
            degraded: false,
            degradedReason: null,
          },
        };
      }
    } catch {
      // fall through
    }

    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    const path = pathFromWaypoints(origin, intermediates, destination);
    return {
      kind,
      source: "fallback",
      distanceKm: Math.round(km * 10) / 10,
      durationMin: null,
      path,
      encodedPolyline: null,
      waypoints,
      quality: {
        sampleCount: waypoints.length,
        coverageRatio: null,
        degraded: false,
        degradedReason: null,
      },
    };
  }

  private async loadPlannedVisitPoints(
    ownerId: string,
    date: Date,
    visitIdsOverride?: string[],
  ): Promise<{ points: LatLng[]; waypoints: RouteGeometryWaypoint[] }> {
    if (visitIdsOverride?.length) {
      const visits = await this.prisma.visit.findMany({
        where: { ownerId, id: { in: visitIdsOverride } },
        select: {
          id: true,
          lat: true,
          lng: true,
          title: true,
          contact: { select: { lat: true, lng: true, firstName: true, lastName: true } },
          company: { select: { lat: true, lng: true, name: true } },
        },
      });
      const byId = new Map(visits.map((v) => [v.id, v]));
      const ordered = visitIdsOverride
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((v) => {
          const coords = effectiveVisitLatLng(v!);
          const label =
            v!.title?.trim() ||
            (v!.contact
              ? [v!.contact.firstName, v!.contact.lastName].filter(Boolean).join(" ")
              : null) ||
            v!.company?.name ||
            null;
          return coords
            ? {
                coords,
                wp: {
                  lat: coords.lat,
                  lng: coords.lng,
                  label,
                  visitId: v!.id,
                } satisfies RouteGeometryWaypoint,
              }
            : null;
        })
        .filter(Boolean) as { coords: LatLng; wp: RouteGeometryWaypoint }[];
      return {
        points: ordered.map((x) => x.coords),
        waypoints: ordered.map((x) => x.wp),
      };
    }

    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId, date } },
      include: {
        stops: {
          orderBy: { position: "asc" },
          include: {
            visit: {
              include: {
                contact: { select: { lat: true, lng: true, firstName: true, lastName: true } },
                company: { select: { lat: true, lng: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (plan?.stops?.length) {
      const rows = plan.stops
        .map((s) => {
          const coords = effectiveVisitLatLng(s.visit);
          if (!coords) return null;
          const v = s.visit;
          const label =
            v.title?.trim() ||
            (v.contact
              ? [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ")
              : null) ||
            v.company?.name ||
            null;
          return {
            coords,
            wp: { lat: coords.lat, lng: coords.lng, label, visitId: v.id },
          };
        })
        .filter(Boolean) as { coords: LatLng; wp: RouteGeometryWaypoint }[];
      return { points: rows.map((r) => r.coords), waypoints: rows.map((r) => r.wp) };
    }

    const dayStart = date;
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const scheduled = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: { in: ["SCHEDULED", "IN_PROGRESS", "DONE"] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { startsAt: "asc" },
      include: {
        contact: { select: { lat: true, lng: true, firstName: true, lastName: true } },
        company: { select: { lat: true, lng: true, name: true } },
      },
    });
    const rows = scheduled
      .map((v) => {
        const coords = effectiveVisitLatLng(v);
        if (!coords) return null;
        const label =
          v.title?.trim() ||
          (v.contact
            ? [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ")
            : null) ||
          v.company?.name ||
          null;
        return { coords, wp: { lat: coords.lat, lng: coords.lng, label, visitId: v.id } };
      })
      .filter(Boolean) as { coords: LatLng; wp: RouteGeometryWaypoint }[];
    return { points: rows.map((r) => r.coords), waypoints: rows.map((r) => r.wp) };
  }

  private async loadFactVisitPoints(ownerId: string, date: Date) {
    const dayStart = date;
    const dayEnd = new Date(date);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: "DONE",
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        lat: true,
        lng: true,
        title: true,
        completedAt: true,
        endsAt: true,
        startsAt: true,
        contact: { select: { lat: true, lng: true, firstName: true, lastName: true } },
        company: { select: { lat: true, lng: true, name: true } },
      },
      orderBy: [{ completedAt: "asc" }, { endsAt: "asc" }, { startsAt: "asc" }],
    });
    const rows = done
      .map((v) => {
        const coords = effectiveVisitLatLng(v);
        if (!coords) return null;
        const label =
          v.title?.trim() ||
          (v.contact
            ? [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ")
            : null) ||
          v.company?.name ||
          null;
        return { coords, wp: { lat: coords.lat, lng: coords.lng, label, visitId: v.id } };
      })
      .filter(Boolean) as { coords: LatLng; wp: RouteGeometryWaypoint }[];
    return { points: rows.map((r) => r.coords), waypoints: rows.map((r) => r.wp) };
  }

  private async loadGpsTrack(ownerId: string, date: Date) {
    const shifts = await this.prisma.fieldShift.findMany({
      where: { ownerId, date },
      orderBy: { startedAt: "asc" },
      select: { id: true, startedAt: true, endedAt: true, trackingEnabled: true },
    });

    if (shifts.length === 0) {
      return {
        path: [] as LatLng[],
        sampleCount: 0,
        coverageRatio: null as number | null,
        shiftDurationMin: null as number | null,
      };
    }

    const shiftIds = shifts.map((s) => s.id);
    const samples = await this.prisma.fieldLocationSample.findMany({
      where: { shiftId: { in: shiftIds } },
      orderBy: { clientRecordedAt: "asc" },
      select: { lat: true, lng: true, clientRecordedAt: true },
    });

    const path: LatLng[] = samples.map((s) => ({ lat: s.lat, lng: s.lng }));
    const firstShift = shifts[0]!;
    const lastShift = shifts[shifts.length - 1]!;
    const spanStart = firstShift.startedAt.getTime();
    const spanEnd = (lastShift.endedAt ?? new Date()).getTime();
    const shiftDurationMin = Math.max(1, (spanEnd - spanStart) / 60000);

    let sampledSpanMin = 0;
    if (samples.length >= 2) {
      const t0 = samples[0]!.clientRecordedAt.getTime();
      const t1 = samples[samples.length - 1]!.clientRecordedAt.getTime();
      sampledSpanMin = Math.max(0, (t1 - t0) / 60000);
    }

    const coverageRatio =
      shiftDurationMin > 0
        ? Math.min(1, Math.round((sampledSpanMin / shiftDurationMin) * 100) / 100)
        : null;

    return {
      path: this.downsamplePath(path),
      sampleCount: samples.length,
      coverageRatio,
      shiftDurationMin,
    };
  }

  private pathDistanceKm(path: LatLng[]): number | null {
    if (path.length < 2) return null;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      total += this.haversineKm(a.lat, a.lng, [], b.lat, b.lng);
    }
    return Math.round(total * 10) / 10;
  }

  async getRouteGeometry(
    dateStr: string,
    kind: RouteGeometryKind,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts & { visitIds?: string[] },
  ): Promise<RouteGeometryResult> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    const date = this.parseDate(dateStr);
    const traffic = opts?.traffic === true;

    if (kind === "planned") {
      const { points, waypoints } = await this.loadPlannedVisitPoints(
        ownerId,
        date,
        opts?.visitIds,
      );
      if (points.length === 0) return this.emptyGeometry(kind, "no_planned_stops");
      return this.buildRoutedGeometry({ kind, visitPoints: points, waypoints, ownerId, traffic });
    }

    if (kind === "fact_visits") {
      const { points, waypoints } = await this.loadFactVisitPoints(ownerId, date);
      if (points.length < 2) return this.emptyGeometry(kind, "insufficient_completed_visits");
      return this.buildRoutedGeometry({ kind, visitPoints: points, waypoints, ownerId, traffic });
    }

    const gps = await this.loadGpsTrack(ownerId, date);
    if (gps.sampleCount < 2 || gps.path.length < 2) {
      return this.emptyGeometry(kind, "insufficient_gps_samples");
    }

    const degraded =
      gps.sampleCount < 10 || (gps.coverageRatio != null && gps.coverageRatio < 0.25);
    const distanceKm = this.pathDistanceKm(gps.path);

    return {
      kind: "fact_gps",
      source: "raw_gps",
      distanceKm,
      durationMin: null,
      path: gps.path,
      encodedPolyline: null,
      waypoints: [],
      quality: {
        sampleCount: gps.sampleCount,
        coverageRatio: gps.coverageRatio,
        degraded,
        degradedReason: degraded ? "low_gps_coverage" : null,
      },
    };
  }

  async getFactGpsRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "raw_gps" | "none" }> {
    const geom = await this.getRouteGeometry(dateStr, "fact_gps", actor, opts);
    if (geom.source === "none" || geom.path.length < 2) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }
    return {
      distanceKm: geom.distanceKm,
      durationMin: geom.durationMin,
      source: "raw_gps",
    };
  }

  async getRouteGeometryBundle(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts & { visitIds?: string[] },
  ): Promise<RouteGeometryBundle> {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);

    const [planned, factVisits, factGps] = await Promise.all([
      this.getRouteGeometry(dateStr, "planned", actor, opts),
      this.getRouteGeometry(dateStr, "fact_visits", actor, opts),
      this.getRouteGeometry(dateStr, "fact_gps", actor, opts),
    ]);

    const compensationFactKind: RouteGeometryBundle["compensationFactKind"] =
      factGps.source !== "none" && !factGps.quality.degraded && factGps.path.length >= 2
        ? "fact_gps"
        : "fact_visits";

    return {
      date: dateStr,
      ownerId,
      planned,
      factVisits,
      factGps,
      compensationFactKind,
    };
  }

  async previewPlannedGeometry(
    dateStr: string,
    visitIds: string[],
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<RouteGeometryResult> {
    return this.getRouteGeometry(dateStr, "planned", actor, {
      ...opts,
      visitIds,
    });
  }
}

