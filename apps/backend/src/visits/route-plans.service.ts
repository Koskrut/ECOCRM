import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import { resolveRouteGeometry, type LatLng, type RouteAnchorConfig } from "./route-geometry";
import { decodeEncodedPolyline, pathFromWaypoints } from "./polyline.util";
import {
  assessGpsTrackQuality,
  concatPaths,
  downsamplePathUniform,
  isTrackEligibleForCompensation,
  MAX_INTERMEDIATES_PER_LEG,
  splitRouteLegs,
  sumLegMetrics,
} from "./route-routing.util";
import type {
  RouteGeometryBundle,
  RouteGeometryKind,
  RouteGeometryResult,
  RouteGeometryWaypoint,
} from "./route-geometry.types";
import { effectiveVisitLatLng } from "./visit-coordinates";
import { resolveSingleOwnerId } from "./visits-owner-scope";
import { filterGpsTrack } from "../field/gps-sample-filter";
import { kyivDayBounds } from "../crm-timezone";

export type RoutePlanScopeOpts = { traffic?: boolean; ownerId?: string };

@Injectable()
export class RoutePlansService {
  private readonly logger = new Logger(RoutePlansService.name);

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
        polylineQuality: "HIGH_QUALITY",
        computeAlternativeRoutes: false,
        ...(opts.optimize ? { optimizeWaypointOrder: true } : {}),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      this.logger.warn(
        `Google Routes API ${res.status}: ${errBody.slice(0, 400)}`,
      );
      return null;
    }
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

  /** Road-following route via one or more Google Routes legs (handles >25 waypoints). */
  private async computeRouteMultiLeg(opts: {
    origin: LatLng;
    destination: LatLng;
    intermediates: LatLng[];
    traffic: boolean;
    optimize?: boolean;
  }): Promise<{
    distanceKm: number | null;
    durationMin: number | null;
    path: LatLng[];
    encodedPolyline: string | null;
    source: "google" | "fallback";
    optimizedIntermediateIndexes?: number[];
  } | null> {
    const { origin, destination, intermediates, traffic, optimize } = opts;

    if (optimize && intermediates.length <= MAX_INTERMEDIATES_PER_LEG) {
      const google = await this.computeRouteByGoogle({
        origin,
        destination,
        intermediates,
        traffic,
        optimize: true,
      });
      if (!google) return null;
      const path = google.encodedPolyline
        ? decodeEncodedPolyline(google.encodedPolyline)
        : pathFromWaypoints(origin, intermediates, destination);
      return {
        distanceKm: google.distanceKm,
        durationMin: google.durationMin,
        path,
        encodedPolyline: google.encodedPolyline ?? null,
        source: google.encodedPolyline ? "google" : "fallback",
        ...(google.optimizedIntermediateIndexes
          ? { optimizedIntermediateIndexes: google.optimizedIntermediateIndexes }
          : {}),
      };
    }

    const legs = splitRouteLegs(origin, intermediates, destination);
    if (legs.length === 0) return null;

    const decodedPaths: LatLng[][] = [];
    const metrics: Array<{ distanceKm: number | null; durationMin: number | null }> = [];

    for (const leg of legs) {
      const google = await this.computeRouteByGoogle({
        origin: leg.origin,
        destination: leg.destination,
        intermediates: leg.intermediates,
        traffic,
      });
      if (!google?.encodedPolyline) {
        const km = this.haversineKm(
          origin.lat,
          origin.lng,
          intermediates,
          destination.lat,
          destination.lng,
        );
        return {
          distanceKm: Math.round(km * 10) / 10,
          durationMin: null,
          path: pathFromWaypoints(origin, intermediates, destination),
          encodedPolyline: null,
          source: "fallback",
        };
      }
      decodedPaths.push(decodeEncodedPolyline(google.encodedPolyline));
      metrics.push({ distanceKm: google.distanceKm, durationMin: google.durationMin });
    }

    const summed = sumLegMetrics(metrics);
    return {
      distanceKm: summed.distanceKm,
      durationMin: summed.durationMin,
      path: concatPaths(decodedPaths),
      encodedPolyline: null,
      source: "google",
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
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (routed?.source === "google") {
        return {
          distanceKm: routed.distanceKm,
          durationMin: routed.durationMin,
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
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (routed?.source === "google") {
        return { distanceKm: routed.distanceKm, durationMin: routed.durationMin, source: "google" };
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
    const { dayStart, dayEnd } = this.kyivVisitWindowFromStr(dateStr);

    // "Факт" = порядок завершения визитов за день (если completedAt нет — fallback на endsAt/startsAt).
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: "DONE",
        startsAt: { gte: dayStart, lte: dayEnd },
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
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (routed?.source === "google") {
        return { distanceKm: routed.distanceKm, durationMin: routed.durationMin, source: "google" };
      }
    } catch {
      // fall through
    }

    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    return { distanceKm: Math.round(km * 10) / 10, durationMin: null, source: "fallback" };
  }

  private calendarDateStr(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private kyivVisitWindow(date: Date): { dayStart: Date; dayEnd: Date } {
    const { from, to } = kyivDayBounds(this.calendarDateStr(date));
    return { dayStart: from, dayEnd: to };
  }

  private kyivVisitWindowFromStr(dateStr: string): { dayStart: Date; dayEnd: Date } {
    const { from, to } = kyivDayBounds(dateStr);
    return { dayStart: from, dayEnd: to };
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

  /** Chronological GPS track → drivable path (Google Routes, multi-leg). */
  async snapGpsPathToRoads(
    points: LatLng[],
    opts?: { traffic?: boolean },
  ): Promise<{ path: LatLng[]; source: "google" | "fallback" | "none"; distanceKm: number | null }> {
    if (points.length < 2) {
      this.logger.warn("snapGpsPathToRoads: insufficient_points");
      return { path: [], source: "none", distanceKm: null };
    }

    const apiKey = await this.getGoogleMapsApiKey();
    if (!apiKey) {
      this.logger.warn("snapGpsPathToRoads: no_api_key");
      return {
        path: points,
        source: "fallback",
        distanceKm: this.pathDistanceKm(points),
      };
    }

    const sampled = downsamplePathUniform(points, 100);
    if (sampled.length < 2) {
      this.logger.warn("snapGpsPathToRoads: downsample_failed");
      return { path: points, source: "fallback", distanceKm: this.pathDistanceKm(points) };
    }

    const origin = sampled[0]!;
    const destination = sampled[sampled.length - 1]!;
    const intermediates = sampled.length > 2 ? sampled.slice(1, -1) : [];

    try {
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates,
        traffic: opts?.traffic === true,
      });
      if (routed?.source === "google" && routed.path.length >= 2) {
        return {
          path: routed.path,
          source: "google",
          distanceKm: routed.distanceKm,
        };
      }
      if (routed?.source === "fallback") {
        this.logger.warn("snapGpsPathToRoads: partial_chunk_failure");
        return {
          path: routed.path.length >= 2 ? routed.path : points,
          source: "fallback",
          distanceKm: routed.distanceKm ?? this.pathDistanceKm(points),
        };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`snapGpsPathToRoads: api_error ${message}`);
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
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates,
        traffic,
      });
      if (routed?.source === "google" && routed.path.length >= 2) {
        return {
          kind,
          source: "google",
          distanceKm: routed.distanceKm,
          durationMin: routed.durationMin,
          path: routed.path,
          encodedPolyline: routed.encodedPolyline,
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

    const { dayStart, dayEnd } = this.kyivVisitWindow(date);
    const scheduled = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: { in: ["SCHEDULED", "IN_PROGRESS", "DONE"] },
        startsAt: { gte: dayStart, lte: dayEnd },
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
    const { dayStart, dayEnd } = this.kyivVisitWindow(date);
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: "DONE",
        startsAt: { gte: dayStart, lte: dayEnd },
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

    const trackingShifts = shifts.filter((s) => s.trackingEnabled);
    const hasTrackingEnabledShift = trackingShifts.length > 0;

    if (!hasTrackingEnabledShift) {
      return {
        path: [] as LatLng[],
        fullPath: [] as LatLng[],
        distanceKm: null as number | null,
        sampleCount: 0,
        coverageRatio: null as number | null,
        shiftDurationMin: null as number | null,
        hasTrackingEnabledShift: false,
      };
    }

    const shiftIds = trackingShifts.map((s) => s.id);
    const samples = await this.prisma.fieldLocationSample.findMany({
      where: { shiftId: { in: shiftIds } },
      orderBy: { clientRecordedAt: "asc" },
      select: { lat: true, lng: true, accuracyM: true, clientRecordedAt: true },
    });

    const filtered = filterGpsTrack(samples);
    const fullPath: LatLng[] = filtered.map((s) => ({ lat: s.lat, lng: s.lng }));
    const firstShift = trackingShifts[0]!;
    const lastShift = trackingShifts[trackingShifts.length - 1]!;
    const spanStart = firstShift.startedAt.getTime();
    const spanEnd = (lastShift.endedAt ?? new Date()).getTime();
    const shiftDurationMin = Math.max(1, (spanEnd - spanStart) / 60000);

    let sampledSpanMin = 0;
    if (filtered.length >= 2) {
      const t0 = filtered[0]!.clientRecordedAt.getTime();
      const t1 = filtered[filtered.length - 1]!.clientRecordedAt.getTime();
      sampledSpanMin = Math.max(0, (t1 - t0) / 60000);
    }

    const coverageRatio =
      shiftDurationMin > 0
        ? Math.min(1, Math.round((sampledSpanMin / shiftDurationMin) * 100) / 100)
        : null;

    return {
      path: this.downsamplePath(fullPath),
      fullPath,
      distanceKm: this.pathDistanceKm(fullPath),
      sampleCount: filtered.length,
      coverageRatio,
      shiftDurationMin,
      hasTrackingEnabledShift: true,
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
    if (gps.sampleCount < 2 || gps.fullPath.length < 2) {
      return this.emptyGeometry(kind, "insufficient_gps_samples");
    }

    const { degraded, degradedReason } = assessGpsTrackQuality(
      gps.sampleCount,
      gps.coverageRatio,
    );

    let distanceKm = gps.distanceKm;
    let path = gps.path;
    let source: RouteGeometryResult["source"] = "raw_gps";

    const snapped = await this.snapGpsPathToRoads(gps.fullPath, { traffic });
    if (snapped.source !== "none" && snapped.distanceKm != null) {
      distanceKm = snapped.distanceKm;
      if (snapped.path.length >= 2) {
        path = snapped.path;
      }
      source = snapped.source === "google" ? "google" : "raw_gps";
    }

    if (distanceKm == null) {
      distanceKm = this.pathDistanceKm(gps.fullPath);
    }

    return {
      kind: "fact_gps",
      source,
      distanceKm,
      durationMin: null,
      path,
      encodedPolyline: null,
      waypoints: [],
      quality: {
        sampleCount: gps.sampleCount,
        coverageRatio: gps.coverageRatio,
        degraded,
        degradedReason,
        rawDistanceKm: gps.distanceKm,
        hasTrackingEnabledShift: gps.hasTrackingEnabledShift,
      },
    };
  }

  async getFactGpsRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<{
    distanceKm: number | null;
    durationMin: number | null;
    source: "google" | "fallback" | "raw_gps" | "none";
  }> {
    const geom = await this.getRouteGeometry(dateStr, "fact_gps", actor, opts);
    if (geom.source === "none" || geom.path.length < 2) {
      return { distanceKm: null, durationMin: null, source: "none" };
    }
    return {
      distanceKm: geom.distanceKm,
      durationMin: geom.durationMin,
      source: geom.source,
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

    const eligibility = isTrackEligibleForCompensation({
      hasTrackingEnabledShift: factGps.quality.hasTrackingEnabledShift ?? false,
      filteredSampleCount: factGps.quality.sampleCount,
      rawPolylineDistanceKm: factGps.quality.rawDistanceKm ?? null,
    });

    const compensationFactKind: RouteGeometryBundle["compensationFactKind"] =
      eligibility.eligible ? "fact_gps" : "fact_visits";

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

