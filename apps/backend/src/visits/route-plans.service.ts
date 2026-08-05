import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthUser } from "../auth/auth.types";
import { OsrmRoutingService } from "../routing/osrm-routing.service";
import { RouteResultCache } from "../routing/route-result-cache";
import {
  asTrackedSamples,
  bboxDiagonalKm,
  isLoopSnapCollapsed,
  isLoopTripSuspicious,
  LOOP_ENDPOINT_NEAR_KM,
  LOOP_MIN_TRIP_KM,
  splitSamplesByTimeGap,
  stitchPathGaps,
  STITCH_GAP_THRESHOLD_KM,
  TRACK_SEGMENT_GAP_MIN,
  type TrackedGpsSample,
} from "../routing/gps-track-snap.util";
import { resolveRouteGeometry, type LatLng, type RouteAnchorConfig } from "./route-geometry";
import { pathFromWaypoints } from "./polyline.util";
import {
  assessGpsTrackQuality,
  assessPlannedKm,
  concatPaths,
  downsamplePathUniform,
  MIN_TRACK_COMPENSATION_KM,
  selectCompensationFactKind,
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
import { sanitizeGpsTrack } from "../field/gps-sample-filter";
import { kyivDayBounds } from "../crm-timezone";

export type RoutePlanScopeOpts = {
  /** @deprecated Ignored — legacy Google traffic flag. */
  traffic?: boolean;
  ownerId?: string;
  /** Skip OSRM (preview / unsaved order) — haversine only. */
  fallbackOnly?: boolean;
};

type RoutedMultiLegResult = {
  distanceKm: number | null;
  durationMin: number | null;
  path: LatLng[];
  source: "osrm" | "fallback";
};

@Injectable()
export class RoutePlansService {
  private readonly logger = new Logger(RoutePlansService.name);
  private readonly routeCache = new RouteResultCache<RoutedMultiLegResult>(10 * 60 * 1000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly osrm: OsrmRoutingService,
  ) {}

  private async resolveOwner(actor: AuthUser, requestedOwnerId?: string): Promise<string> {
    return resolveSingleOwnerId(this.prisma, actor, requestedOwnerId);
  }

  private routeLegCacheKey(origin: LatLng, destination: LatLng, intermediates: LatLng[]): string {
    const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    return [fmt(origin), ...intermediates.map(fmt), fmt(destination)].join("|");
  }

  /** Road-following route via one or more OSRM legs. */
  private async computeRouteMultiLeg(opts: {
    origin: LatLng;
    destination: LatLng;
    intermediates: LatLng[];
  }): Promise<RoutedMultiLegResult | null> {
    const { origin, destination, intermediates } = opts;
    const cacheKey = this.routeLegCacheKey(origin, destination, intermediates);
    const cached = this.routeCache.get(cacheKey);
    if (cached) return cached;

    const legs = splitRouteLegs(origin, intermediates, destination);
    if (legs.length === 0) return null;

    const decodedPaths: LatLng[][] = [];
    const metrics: Array<{ distanceKm: number | null; durationMin: number | null }> = [];

    for (const leg of legs) {
      const routed = await this.osrm.routeLeg({
        origin: leg.origin,
        destination: leg.destination,
        intermediates: leg.intermediates,
      });
      if (!routed || routed.source !== "osrm" || routed.path.length < 2) {
        const km = this.haversineKm(
          origin.lat,
          origin.lng,
          intermediates,
          destination.lat,
          destination.lng,
        );
        const fallback: RoutedMultiLegResult = {
          distanceKm: Math.round(km * 10) / 10,
          durationMin: null,
          path: pathFromWaypoints(origin, intermediates, destination),
          source: "fallback",
        };
        this.routeCache.set(cacheKey, fallback);
        return fallback;
      }
      decodedPaths.push(routed.path);
      metrics.push({ distanceKm: routed.distanceKm, durationMin: routed.durationMin });
    }

    const summed = sumLegMetrics(metrics);
    const result: RoutedMultiLegResult = {
      distanceKm: summed.distanceKm,
      durationMin: summed.durationMin,
      path: concatPaths(decodedPaths),
      source: "osrm",
    };
    this.routeCache.set(cacheKey, result);
    return result;
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

  async getRouteMetrics(
    dateStr: string,
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "osrm" | "fallback" | "none" }> {
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
      });
      if (routed?.source === "osrm") {
        return {
          distanceKm: routed.distanceKm,
          durationMin: routed.durationMin,
          source: "osrm",
        };
      }
    } catch {
      // fall through
    }

    // Fallback: straight-line sum when OSRM is unavailable
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
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "osrm" | "fallback" | "none" }> {
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

    // Preview must not call OSRM — haversine only while dragging/reordering.
    const km = this.haversineKm(origin.lat, origin.lng, intermediates, destination.lat, destination.lng);
    return { distanceKm: Math.round(km * 10) / 10, durationMin: null, source: "fallback" };
  }

  /**
   * Local nearest-neighbor order. Does not call Google (optimizeWaypointOrder = Pro SKU).
   */
  async optimizeRouteOrder(
    dateStr: string,
    visitIds: string[],
    actor: AuthUser | undefined,
    opts?: RoutePlanScopeOpts,
  ): Promise<{ visitIds: string[]; source: "fallback" }> {
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
    const { usesSettingsAnchors } = resolveRouteGeometry(visitPoints, anchors);

    const intermediatesForOptimize = usesSettingsAnchors
      ? ordered
      : ordered.slice(1, -1);

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
  ): Promise<{ distanceKm: number | null; durationMin: number | null; source: "osrm" | "fallback" | "none" }> {
    if (!actor) throw new BadRequestException("User is required");
    if (!dateStr) throw new BadRequestException("date is required");
    const ownerId = await this.resolveOwner(actor, opts?.ownerId);
    const { dayStart, dayEnd } = this.kyivVisitWindowFromStr(dateStr);

    // Fuel fact: Kyiv day by completedAt (startsAt fallback only when completedAt missing).
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: "DONE",
        OR: [
          { completedAt: { gte: dayStart, lte: dayEnd } },
          { completedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
        ],
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
      });
      if (routed?.source === "osrm") {
        return { distanceKm: routed.distanceKm, durationMin: routed.durationMin, source: "osrm" };
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

  /**
   * Drop RouteStop rows whose Visit.ownerId ≠ plan owner (heals corrupted plans).
   * Returns number of deleted stops.
   */
  private async purgeForeignRouteStops(routePlanId: string, ownerId: string): Promise<number> {
    const foreign = await this.prisma.routeStop.findMany({
      where: {
        routePlanId,
        visit: { ownerId: { not: ownerId } },
      },
      select: { id: true, visitId: true },
    });
    if (foreign.length === 0) return 0;
    await this.prisma.routeStop.deleteMany({
      where: { id: { in: foreign.map((s) => s.id) } },
    });
    this.logger.warn(
      `Purged ${foreign.length} foreign RouteStop(s) from plan=${routePlanId} owner=${ownerId}: ${foreign.map((s) => s.visitId).join(",")}`,
    );
    return foreign.length;
  }

  /** Ensure every visitId belongs to ownerId; throw if any are missing or foreign. */
  private async assertVisitsOwnedBy(ownerId: string, visitIds: string[]): Promise<void> {
    if (visitIds.length === 0) return;
    const owned = await this.prisma.visit.findMany({
      where: { ownerId, id: { in: visitIds } },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map((v) => v.id));
    const foreignOrMissing = visitIds.filter((id) => !ownedSet.has(id));
    if (foreignOrMissing.length > 0) {
      throw new BadRequestException(
        `Cannot add visits that do not belong to this route plan owner (${foreignOrMissing.length}): ${foreignOrMissing.slice(0, 8).join(", ")}${foreignOrMissing.length > 8 ? "…" : ""}`,
      );
    }
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
    if (!plan) return null;
    const purged = await this.purgeForeignRouteStops(plan.id, ownerId);
    if (purged > 0) {
      return this.prisma.routePlan.findUnique({
        where: { id: plan.id },
        include: {
          stops: {
            orderBy: { position: "asc" },
            include: { visit: true },
          },
        },
      });
    }
    return plan;
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
    await this.assertVisitsOwnedBy(ownerId, uniqueIds);

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
    await this.purgeForeignRouteStops(plan.id, ownerId);
    const ownedStops = plan.stops.filter((s) => s.visit?.ownerId === ownerId);
    if (ownedStops.length === 0) {
      throw new BadRequestException("No route plan for this date");
    }
    const points = ownedStops
      .map((s) => effectiveVisitLatLng(s.visit))
      .filter((c): c is { lat: number; lng: number } => c != null);
    if (points.length !== ownedStops.length) {
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

  /** Match one GPS chunk to roads (OSRM match → single A→B leg; no haversine payout). */
  private async matchGpsChunkToRoads(
    points: LatLng[],
    opts?: { loopSuspicious?: boolean; referencePathKm?: number | null },
  ): Promise<{ path: LatLng[]; source: "osrm" | "fallback"; distanceKm: number | null }> {
    if (points.length < 2) {
      return { path: points, source: "fallback", distanceKm: null };
    }

    const sampled = downsamplePathUniform(points, 80);
    const simplifiedKm = this.pathDistanceKm(sampled);
    const rawKm = this.pathDistanceKm(points);
    const referenceKm = opts?.referencePathKm ?? simplifiedKm ?? rawKm;

    if (sampled.length < 2) {
      const origin = points[0]!;
      const destination = points[points.length - 1]!;
      return {
        path: [origin, destination],
        source: "fallback",
        distanceKm: null,
      };
    }

    try {
      const matched = await this.osrm.matchTrack(sampled);
      const matchTooTiny =
        matched?.distanceKm != null &&
        (matched.distanceKm < MIN_TRACK_COMPENSATION_KM ||
          (referenceKm != null &&
            referenceKm >= MIN_TRACK_COMPENSATION_KM &&
            matched.distanceKm < referenceKm * 0.25));
      if (matched?.source === "osrm" && matched.path.length >= 2 && !matchTooTiny) {
        return {
          path: matched.path,
          source: "osrm",
          distanceKm: matched.distanceKm,
        };
      }
      if (matchTooTiny) {
        this.logger.warn(
          `snapGpsPathToRoads: match_too_tiny km=${matched?.distanceKm} refKm=${referenceKm}`,
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`snapGpsPathToRoads: match_error ${message}`);
    }

    const origin = sampled[0]!;
    const destination = sampled[sampled.length - 1]!;
    const endpointsNear =
      this.haversineKm(origin.lat, origin.lng, [], destination.lat, destination.lng) <=
      LOOP_ENDPOINT_NEAR_KM;

    if (opts?.loopSuspicious && endpointsNear && (referenceKm ?? 0) >= LOOP_MIN_TRIP_KM) {
      this.logger.warn("snapGpsPathToRoads: loop_chunk_reject_ab_route");
      return {
        path: points,
        source: "fallback",
        distanceKm: null,
      };
    }

    try {
      const routed = await this.computeRouteMultiLeg({
        origin,
        destination,
        intermediates: [],
      });
      if (routed?.source === "osrm" && routed.path.length >= 2) {
        return {
          path: routed.path,
          source: "osrm",
          distanceKm: routed.distanceKm,
        };
      }
      if (routed?.source === "fallback") {
        this.logger.warn("snapGpsPathToRoads: partial_chunk_failure");
        return {
          path: routed.path.length >= 2 ? routed.path : [origin, destination],
          source: "fallback",
          distanceKm: null,
        };
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.warn(`snapGpsPathToRoads: api_error ${message}`);
    }

    return {
      path: [origin, destination],
      source: "fallback",
      distanceKm: null,
    };
  }

  /** Chronological GPS track → drivable path (time-split match + stitch gaps). */
  async snapGpsPathToRoads(
    points: LatLng[] | TrackedGpsSample[],
  ): Promise<{
    path: LatLng[];
    source: "osrm" | "fallback" | "none";
    distanceKm: number | null;
    maxStitchGapKm: number;
    hasUnfilledGaps: boolean;
    snapFailureReason: string | null;
    simplifiedPathDistanceKm: number | null;
  }> {
    const tracked = asTrackedSamples(points);
    const noneResult = {
      path: [] as LatLng[],
      source: "none" as const,
      distanceKm: null,
      maxStitchGapKm: 0,
      hasUnfilledGaps: false,
      snapFailureReason: null as string | null,
      simplifiedPathDistanceKm: null as number | null,
    };

    if (tracked.length < 2) {
      this.logger.warn("snapGpsPathToRoads: insufficient_points");
      return noneResult;
    }

    const trackPoints = tracked.map((s) => ({ lat: s.lat, lng: s.lng }));
    const simplifiedPath = downsamplePathUniform(trackPoints, 80);
    const simplifiedPathDistanceKm = this.pathDistanceKm(simplifiedPath);
    const rawPolylineDistanceKm = this.pathDistanceKm(trackPoints);
    const loopSuspicious = isLoopTripSuspicious({
      first: trackPoints[0]!,
      last: trackPoints[trackPoints.length - 1]!,
      rawPolylineDistanceKm,
      simplifiedPathDistanceKm,
      bboxDiagonalKm: bboxDiagonalKm(trackPoints),
    });

    const chunks = splitSamplesByTimeGap(tracked, TRACK_SEGMENT_GAP_MIN);
    const chunkResults: Array<{
      path: LatLng[];
      source: "osrm" | "fallback";
      distanceKm: number | null;
    }> = [];
    let usedOsrm = false;
    let usedFallback = false;
    let totalKm = 0;

    for (const chunk of chunks) {
      const chunkPoints = chunk.map((s) => ({ lat: s.lat, lng: s.lng }));
      const chunkRefKm = this.pathDistanceKm(downsamplePathUniform(chunkPoints, 80));
      const matched = await this.matchGpsChunkToRoads(chunkPoints, {
        loopSuspicious,
        referencePathKm: chunkRefKm ?? simplifiedPathDistanceKm,
      });
      chunkResults.push(matched);
      if (matched.source === "osrm") usedOsrm = true;
      if (matched.source === "fallback") usedFallback = true;
      if (matched.source === "osrm" && matched.distanceKm != null && Number.isFinite(matched.distanceKm)) {
        totalKm += matched.distanceKm;
      }
    }

    for (let i = 0; i < chunks.length - 1; i++) {
      const prevChunk = chunks[i]!;
      const nextChunk = chunks[i + 1]!;
      const origin = {
        lat: prevChunk[prevChunk.length - 1]!.lat,
        lng: prevChunk[prevChunk.length - 1]!.lng,
      };
      const destination = {
        lat: nextChunk[0]!.lat,
        lng: nextChunk[0]!.lng,
      };
      try {
        const routed = await this.computeRouteMultiLeg({
          origin,
          destination,
          intermediates: [],
        });
        if (routed?.source === "osrm" && routed.distanceKm != null && Number.isFinite(routed.distanceKm)) {
          totalKm += routed.distanceKm;
          usedOsrm = true;
        } else if (routed?.source === "fallback") {
          usedFallback = true;
        }
      } catch {
        usedFallback = true;
      }
    }

    let merged = concatPaths(chunkResults.map((r) => r.path));
    if (merged.length < 2) {
      merged = trackPoints;
    }

    const routeLeg = async (origin: LatLng, destination: LatLng) => {
      try {
        const routed = await this.computeRouteMultiLeg({
          origin,
          destination,
          intermediates: [],
        });
        if (routed?.source === "osrm" && routed.path.length >= 2) {
          usedOsrm = true;
          return { path: routed.path };
        }
        if (routed?.path && routed.path.length >= 2) {
          usedFallback = true;
          return { path: routed.path };
        }
      } catch {
        /* map stitch only */
      }
      return null;
    };

    const stitched = await stitchPathGaps(merged, routeLeg, STITCH_GAP_THRESHOLD_KM);
    let distanceKm = totalKm > 0 ? Math.round(totalKm * 10) / 10 : null;

    let snapFailureReason: string | null = null;
    if (
      isLoopSnapCollapsed({
        snappedDistanceKm: distanceKm,
        simplifiedPathDistanceKm,
        loopSuspicious,
      }) ||
      (loopSuspicious &&
        distanceKm == null &&
        simplifiedPathDistanceKm != null &&
        simplifiedPathDistanceKm >= LOOP_MIN_TRIP_KM)
    ) {
      snapFailureReason = "gps_snap_loop_collapse";
      distanceKm = null;
      this.logger.warn(
        `snapGpsPathToRoads: loop_collapse simplified=${simplifiedPathDistanceKm} snapped=${totalKm}`,
      );
    }

    if (stitched.path.length < 2) {
      return {
        path: trackPoints,
        source: "fallback",
        distanceKm,
        maxStitchGapKm: stitched.maxStitchGapKm,
        hasUnfilledGaps: stitched.hasUnfilledGaps,
        snapFailureReason,
        simplifiedPathDistanceKm,
      };
    }

    const source: "osrm" | "fallback" = usedOsrm ? "osrm" : "fallback";

    return {
      path: stitched.path,
      source,
      distanceKm,
      maxStitchGapKm: stitched.maxStitchGapKm,
      hasUnfilledGaps: stitched.hasUnfilledGaps,
      snapFailureReason,
      simplifiedPathDistanceKm,
    };
  }

  private async buildRoutedGeometry(opts: {
    kind: RouteGeometryKind;
    visitPoints: LatLng[];
    waypoints: RouteGeometryWaypoint[];
    ownerId: string;
    /** When true, skip OSRM (preview / drag) — haversine only. */
    fallbackOnly?: boolean;
  }): Promise<RouteGeometryResult> {
    const { kind, visitPoints, waypoints, ownerId, fallbackOnly } = opts;
    if (visitPoints.length === 0) {
      return this.emptyGeometry(kind, "no_points");
    }

    const anchors = await this.getRouteAnchors(ownerId);
    const { origin, destination, intermediates } = resolveRouteGeometry(visitPoints, anchors);

    if (!fallbackOnly) {
      try {
        const routed = await this.computeRouteMultiLeg({
          origin,
          destination,
          intermediates,
        });
        if (routed?.source === "osrm" && routed.path.length >= 2) {
          return {
            kind,
            source: "osrm",
            distanceKm: routed.distanceKm,
            durationMin: routed.durationMin,
            path: routed.path,
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
      await this.purgeForeignRouteStops(plan.id, ownerId);
      const ownedStops = plan.stops.filter((s) => s.visit?.ownerId === ownerId);
      const rows = ownedStops
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
      if (rows.length > 0) {
        return { points: rows.map((r) => r.coords), waypoints: rows.map((r) => r.wp) };
      }
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
        OR: [
          { completedAt: { gte: dayStart, lte: dayEnd } },
          { completedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
        ],
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

  private async loadFactVisitRows(ownerId: string, date: Date) {
    const { dayStart, dayEnd } = this.kyivVisitWindow(date);
    const done = await this.prisma.visit.findMany({
      where: {
        ownerId,
        status: "DONE",
        OR: [
          { completedAt: { gte: dayStart, lte: dayEnd } },
          { completedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
        ],
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
    return done
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
        return {
          coords,
          wp: { lat: coords.lat, lng: coords.lng, label, visitId: v.id } satisfies RouteGeometryWaypoint,
          completedAt: v.completedAt,
          endsAt: v.endsAt,
          startsAt: v.startsAt,
        };
      })
      .filter(Boolean) as Array<{
      coords: LatLng;
      wp: RouteGeometryWaypoint;
      completedAt: Date | null;
      endsAt: Date | null;
      startsAt: Date | null;
    }>;
  }

  private filterTrackedSamplesInWindow(
    samples: Array<{ lat: number; lng: number; clientRecordedAt: Date }>,
    t0: Date | null,
    t1: Date | null,
  ): TrackedGpsSample[] {
    const t0ms = t0?.getTime() ?? Number.NEGATIVE_INFINITY;
    const t1ms = t1?.getTime() ?? Number.POSITIVE_INFINITY;
    return samples.filter((s) => {
      const t = s.clientRecordedAt.getTime();
      return t >= t0ms && t <= t1ms;
    });
  }

  /** Visit-order legs: OSRM match when GPS samples exist in window, else visit→visit route. */
  private async buildFactVisitsGpsGeometry(
    ownerId: string,
    date: Date,
  ): Promise<RouteGeometryResult> {
    const kind: RouteGeometryKind = "fact_visits_gps";
    const visits = await this.loadFactVisitRows(ownerId, date);
    if (visits.length < 2) {
      return this.emptyGeometry(kind, "insufficient_completed_visits");
    }

    const [gps, anchors] = await Promise.all([
      this.loadGpsTrack(ownerId, date),
      this.getRouteAnchors(ownerId),
    ]);
    const tracked = gps.trackedSamples;

    type Leg = { from: LatLng; to: LatLng; t0: Date | null; t1: Date | null };
    const legs: Leg[] = [];

    for (let i = 0; i < visits.length - 1; i++) {
      const a = visits[i]!;
      const b = visits[i + 1]!;
      legs.push({
        from: a.coords,
        to: b.coords,
        t0: a.completedAt ?? a.endsAt ?? a.startsAt,
        t1: b.completedAt ?? b.endsAt ?? b.startsAt,
      });
    }

    const firstVisit = visits[0]!;
    const lastVisit = visits[visits.length - 1]!;
    if (anchors.origin && anchors.hasExplicitStart) {
      const t1 = firstVisit.completedAt ?? firstVisit.endsAt ?? firstVisit.startsAt;
      const windowSamples = this.filterTrackedSamplesInWindow(tracked, null, t1);
      if (windowSamples.length >= 2) {
        legs.unshift({
          from: anchors.origin,
          to: firstVisit.coords,
          t0: null,
          t1,
        });
      }
    }
    if (anchors.destination && anchors.hasExplicitEnd) {
      const t0 = lastVisit.completedAt ?? lastVisit.endsAt ?? lastVisit.startsAt;
      const windowSamples = this.filterTrackedSamplesInWindow(tracked, t0, null);
      if (windowSamples.length >= 2) {
        legs.push({
          from: lastVisit.coords,
          to: anchors.destination,
          t0,
          t1: null,
        });
      }
    }

    let totalKm = 0;
    let usedOsrm = false;
    const paths: LatLng[][] = [];

    for (const leg of legs) {
      const windowSamples = this.filterTrackedSamplesInWindow(tracked, leg.t0, leg.t1);
      if (windowSamples.length >= 2) {
        const snapped = await this.snapGpsPathToRoads(windowSamples);
        if (snapped.source === "osrm" && snapped.distanceKm != null) {
          totalKm += snapped.distanceKm;
          usedOsrm = true;
        }
        if (snapped.path.length >= 2) paths.push(snapped.path);
      } else {
        const routed = await this.computeRouteMultiLeg({
          origin: leg.from,
          destination: leg.to,
          intermediates: [],
        });
        if (routed?.source === "osrm" && routed.distanceKm != null) {
          totalKm += routed.distanceKm;
          usedOsrm = true;
        }
        if (routed?.path && routed.path.length >= 2) paths.push(routed.path);
      }
    }

    const path = concatPaths(paths);
    return {
      kind,
      source: usedOsrm ? "osrm" : "none",
      distanceKm: totalKm > 0 ? Math.round(totalKm * 10) / 10 : null,
      durationMin: null,
      path,
      encodedPolyline: null,
      waypoints: visits.map((v) => v.wp),
      quality: {
        sampleCount: visits.length,
        coverageRatio: gps.coverageRatio,
        degraded: !usedOsrm,
        degradedReason: usedOsrm ? null : "hybrid_route_unavailable",
      },
    };
  }

  private async loadShiftActive(ownerId: string, date: Date): Promise<boolean> {
    const open = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date, endedAt: null },
      select: { id: true },
    });
    return open != null;
  }

  /** True when today's route plan still has stops not yet DONE. */
  private async loadPlanIncludesScheduled(ownerId: string, date: Date): Promise<boolean> {
    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId, date } },
      include: {
        stops: {
          include: { visit: { select: { status: true, ownerId: true } } },
        },
      },
    });
    if (!plan?.stops.length) return false;
    const openStatuses = new Set(["SCHEDULED", "IN_PROGRESS", "PLANNED_UNASSIGNED"]);
    return plan.stops.some(
      (s) => s.visit?.ownerId === ownerId && openStatuses.has(s.visit.status),
    );
  }

  private computeLastSampleNearHome(
    anchors: RouteAnchorConfig,
    lastSample: { lat: number; lng: number } | null | undefined,
  ): boolean | null {
    if (!lastSample) return null;
    const home = anchors.destination ?? anchors.origin;
    if (!home) return null;
    const km = this.haversineKm(lastSample.lat, lastSample.lng, [], home.lat, home.lng);
    return km <= LOOP_ENDPOINT_NEAR_KM;
  }

  private async loadLastDoneVisitCompletedAt(
    ownerId: string,
    date: Date,
  ): Promise<Date | null> {
    const { dayStart, dayEnd } = this.kyivVisitWindow(date);
    const last = await this.prisma.visit.findFirst({
      where: {
        ownerId,
        status: "DONE",
        completedAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { completedAt: "desc" },
      select: { completedAt: true },
    });
    return last?.completedAt ?? null;
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
        trackedSamples: [] as Array<{
          lat: number;
          lng: number;
          clientRecordedAt: Date;
        }>,
        distanceKm: null as number | null,
        sampleCount: 0,
        coverageRatio: null as number | null,
        shiftDurationMin: null as number | null,
        hasTrackingEnabledShift: false,
        lastSampleAt: null as Date | null,
        droppedReasons: {} as Record<string, number>,
        reanchorUsed: false,
      };
    }

    const shiftIds = trackingShifts.map((s) => s.id);
    const samples = await this.prisma.fieldLocationSample.findMany({
      where: { shiftId: { in: shiftIds } },
      orderBy: { clientRecordedAt: "asc" },
      select: { lat: true, lng: true, accuracyM: true, clientRecordedAt: true },
    });

    const sanitized = sanitizeGpsTrack(samples);
    const filtered = sanitized.samples;
    const fullPath: LatLng[] = filtered.map((s) => ({ lat: s.lat, lng: s.lng }));
    const firstShift = trackingShifts[0]!;
    const lastShift = trackingShifts[trackingShifts.length - 1]!;
    const spanStart = firstShift.startedAt.getTime();

    let lastSampleAt: Date | null = null;
    if (filtered.length >= 1) {
      lastSampleAt = filtered[filtered.length - 1]!.clientRecordedAt;
    }

    // Open shifts: don't stretch span to wall-clock now (forgotten end → false low coverage).
    const spanEnd = (
      lastShift.endedAt ??
      lastSampleAt ??
      new Date()
    ).getTime();
    const shiftDurationMin = Math.max(1, (spanEnd - spanStart) / 60000);

    let sampledSpanMin = 0;
    if (filtered.length >= 2 && lastSampleAt) {
      const t0 = filtered[0]!.clientRecordedAt.getTime();
      const t1 = lastSampleAt.getTime();
      sampledSpanMin = Math.max(0, (t1 - t0) / 60000);
    }

    const coverageRatio =
      shiftDurationMin > 0
        ? Math.min(1, Math.round((sampledSpanMin / shiftDurationMin) * 100) / 100)
        : null;

    return {
      path: this.downsamplePath(fullPath),
      fullPath,
      trackedSamples: filtered,
      distanceKm: this.pathDistanceKm(fullPath),
      sampleCount: filtered.length,
      coverageRatio,
      shiftDurationMin,
      hasTrackingEnabledShift: true,
      lastSampleAt,
      droppedReasons: sanitized.droppedReasons,
      reanchorUsed: sanitized.reanchorUsed,
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
    const fallbackOnly = opts?.fallbackOnly === true;

    if (kind === "planned") {
      const { points, waypoints } = await this.loadPlannedVisitPoints(
        ownerId,
        date,
        opts?.visitIds,
      );
      if (points.length === 0) return this.emptyGeometry(kind, "no_planned_stops");
      return this.buildRoutedGeometry({ kind, visitPoints: points, waypoints, ownerId, fallbackOnly });
    }

    if (kind === "fact_visits") {
      const { points, waypoints } = await this.loadFactVisitPoints(ownerId, date);
      if (points.length < 2) return this.emptyGeometry(kind, "insufficient_completed_visits");
      return this.buildRoutedGeometry({ kind, visitPoints: points, waypoints, ownerId, fallbackOnly });
    }

    const [gps, lastDoneVisitCompletedAt] = await Promise.all([
      this.loadGpsTrack(ownerId, date),
      this.loadLastDoneVisitCompletedAt(ownerId, date),
    ]);
    if (gps.sampleCount < 2 || gps.fullPath.length < 2) {
      const empty = this.emptyGeometry(kind, "insufficient_gps_samples");
      return {
        ...empty,
        quality: {
          ...empty.quality,
          sampleCount: gps.sampleCount,
          coverageRatio: gps.coverageRatio,
          hasTrackingEnabledShift: gps.hasTrackingEnabledShift,
          lastSampleAt: gps.lastSampleAt?.toISOString() ?? null,
          lastDoneVisitCompletedAt: lastDoneVisitCompletedAt?.toISOString() ?? null,
          rawDistanceKm: gps.distanceKm,
          droppedReasons: gps.droppedReasons,
          reanchorUsed: gps.reanchorUsed,
        },
      };
    }

    const { degraded: coverageDegraded, degradedReason: coverageReason } = assessGpsTrackQuality(
      gps.sampleCount,
      gps.coverageRatio,
    );
    let degraded = coverageDegraded;
    let degradedReason = coverageReason;

    let distanceKm: number | null = null;
    let path = gps.path;
    let source: RouteGeometryResult["source"] = "raw_gps";
    let maxStitchGapKm: number | null = null;
    let hasUnfilledGaps = false;
    let snapFailureReason: string | null = null;
    let snappedDistanceKm: number | null = null;

    if (!fallbackOnly) {
      const snapped = await this.snapGpsPathToRoads(
        gps.trackedSamples.map((s) => ({
          lat: s.lat,
          lng: s.lng,
          clientRecordedAt: s.clientRecordedAt,
        })),
      );
      snapFailureReason = snapped.snapFailureReason;
      snappedDistanceKm = snapped.distanceKm;
      maxStitchGapKm = snapped.maxStitchGapKm;
      hasUnfilledGaps = snapped.hasUnfilledGaps;

      if (snapFailureReason === "gps_snap_loop_collapse") {
        degraded = true;
        degradedReason = "gps_snap_loop_collapse";
        source = "none";
        distanceKm = null;
        path = gps.fullPath.length >= 2 ? gps.fullPath : gps.path;
      } else if (snapped.source === "osrm" && snapped.distanceKm != null) {
        distanceKm = snapped.distanceKm;
        if (snapped.path.length >= 2) {
          path = snapped.path;
        }
        source = "osrm";
      } else if (snapped.path.length >= 2) {
        path = snapped.path;
        source = "raw_gps";
        distanceKm = null;
      }

      if (hasUnfilledGaps || (maxStitchGapKm != null && maxStitchGapKm > 1)) {
        degraded = true;
        if (degradedReason == null) degradedReason = "gps_stitch_gaps";
      }
    } else {
      path = gps.fullPath.length >= 2 ? gps.fullPath : gps.path;
      source = "raw_gps";
      distanceKm = null;
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
        snappedDistanceKm,
        snapFailureReason,
        hasTrackingEnabledShift: gps.hasTrackingEnabledShift,
        lastSampleAt: gps.lastSampleAt?.toISOString() ?? null,
        lastDoneVisitCompletedAt: lastDoneVisitCompletedAt?.toISOString() ?? null,
        maxStitchGapKm,
        hasUnfilledGaps,
        droppedReasons: gps.droppedReasons,
        reanchorUsed: gps.reanchorUsed,
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
    source: "osrm" | "fallback" | "raw_gps" | "none";
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
    const date = this.parseDate(dateStr);

    const [planned, factVisits, factGps, factVisitsGps, shiftActive, anchors, planIncludesScheduled, gpsMeta] =
      await Promise.all([
        this.getRouteGeometry(dateStr, "planned", actor, opts),
        this.getRouteGeometry(dateStr, "fact_visits", actor, opts),
        this.getRouteGeometry(dateStr, "fact_gps", actor, opts),
        this.buildFactVisitsGpsGeometry(ownerId, date),
        this.loadShiftActive(ownerId, date),
        this.getRouteAnchors(ownerId),
        this.loadPlanIncludesScheduled(ownerId, date),
        this.loadGpsTrack(ownerId, date),
      ]);

    const snapFailureReason = factGps.quality.snapFailureReason ?? null;
    const lastTracked = gpsMeta.trackedSamples[gpsMeta.trackedSamples.length - 1];
    const lastSampleNearHome = this.computeLastSampleNearHome(
      anchors,
      lastTracked ? { lat: lastTracked.lat, lng: lastTracked.lng } : null,
    );

    const compensationFactKm =
      factGps.distanceKm ?? factVisits.distanceKm ?? factVisitsGps.distanceKm;
    const plannedAssessment = assessPlannedKm({
      plannedKm: planned.distanceKm,
      factKm: compensationFactKm,
    });

    const selection = selectCompensationFactKind({
      hasTrackingEnabledShift: factGps.quality.hasTrackingEnabledShift ?? false,
      filteredSampleCount: factGps.quality.sampleCount,
      rawPolylineDistanceKm: factGps.quality.rawDistanceKm ?? null,
      coverageRatio: factGps.quality.coverageRatio,
      lastSampleAt: factGps.quality.lastSampleAt ?? null,
      lastDoneVisitCompletedAt: factGps.quality.lastDoneVisitCompletedAt ?? null,
      snappedTrackDistanceKm: factGps.quality.snappedDistanceKm ?? factGps.distanceKm,
      visitRouteDistanceKm: factVisits.distanceKm,
      snapFailureReason,
      plannedKmWarning: plannedAssessment.warning,
      factVisitsGpsDistanceKm: factVisitsGps.distanceKm,
    });

    const compensationWarnings = [...(selection.warnings ?? [])];
    if (plannedAssessment.warning && !compensationWarnings.includes(plannedAssessment.warning)) {
      compensationWarnings.push(plannedAssessment.warning);
    }

    const visitKm = factVisits.distanceKm ?? 0;
    const gpsKm = factGps.distanceKm ?? 0;
    const incompleteTour =
      shiftActive ||
      (lastSampleNearHome === false &&
        (factGps.quality.hasTrackingEnabledShift ?? false) &&
        visitKm > gpsKm * 1.1);

    return {
      date: dateStr,
      ownerId,
      planned,
      factVisits,
      factGps,
      factVisitsGps,
      compensationFactKind: selection.kind,
      compensationIneligibleReason: selection.ineligibleReason,
      compensationWarnings,
      shiftActive,
      incompleteTour,
      planIncludesScheduled,
      lastSampleNearHome,
      plannedKmWarning: plannedAssessment.warning,
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
      fallbackOnly: true,
    });
  }
}

