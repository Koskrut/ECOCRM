import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  StreamableFile,
  forwardRef,
} from "@nestjs/common";
import { FuelCompensationStatus, Prisma, UserRole, VisitStatus } from "@prisma/client";
import * as XLSX from "xlsx";
import type { AuthUser } from "../auth/auth.types";
import { kyivDayBounds } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { RoutePlansService } from "../visits/route-plans.service";
import type { FuelCalculationSnapshot, FuelVisitSnapshotRow } from "./field-fuel.types";
import { resolveTrackMetricsSource } from "./field-fuel.types";
import { estimateFuelFromKm } from "./field-fuel.estimate";
import type { FuelRefuelTotals } from "./field-fuel-refuels.types";
import { FieldFuelRefuelsService } from "./field-fuel-refuels.service";
import { effectiveVisitLatLng, visitHasRoutableCoordinates } from "../visits/visit-coordinates";
import { assertCanAccessOwner, getAllowedOwnerIds } from "../visits/visits-owner-scope";
import { assessPlannedKm, resolveUsableGpsKm } from "../visits/route-routing.util";

const MAX_EXPORT_DAYS = 31;

@Injectable()
export class FieldFuelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routePlans: RoutePlansService,
    @Inject(forwardRef(() => FieldFuelRefuelsService))
    private readonly refuels: FieldFuelRefuelsService,
  ) {}

  parseUtcDay(dateStr: string): Date {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date");
    }
    return date;
  }

  private kyivVisitWindow(dateStr: string): { dayStart: Date; dayEnd: Date } {
    try {
      const { from, to } = kyivDayBounds(dateStr);
      return { dayStart: from, dayEnd: to };
    } catch {
      throw new BadRequestException("Invalid date");
    }
  }

  async resolveOwnerId(actor: AuthUser, requestedOwnerId?: string): Promise<string> {
    const target = requestedOwnerId?.trim() || actor.id;
    await assertCanAccessOwner(this.prisma, actor, target);
    return target;
  }

  private visitDisplayTitle(v: {
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

  private async loadDoneVisitsForDay(ownerId: string, dateStr: string) {
    const { dayStart, dayEnd } = this.kyivVisitWindow(dateStr);
    return this.prisma.visit.findMany({
      where: {
        ownerId,
        status: VisitStatus.DONE,
        OR: [
          { completedAt: { gte: dayStart, lte: dayEnd } },
          { completedAt: null, startsAt: { gte: dayStart, lte: dayEnd } },
        ],
      },
      include: {
        contact: { select: { firstName: true, lastName: true, lat: true, lng: true } },
        company: { select: { name: true, lat: true, lng: true } },
      },
      orderBy: [{ completedAt: "asc" }, { endsAt: "asc" }, { startsAt: "asc" }],
    });
  }

  private async planVisitIdSet(ownerId: string, date: Date): Promise<Set<string>> {
    const plan = await this.prisma.routePlan.findUnique({
      where: { ownerId_date: { ownerId, date } },
      include: {
        stops: {
          select: {
            visitId: true,
            visit: { select: { ownerId: true } },
          },
        },
      },
    });
    const ids = (plan?.stops ?? [])
      .filter((s) => s.visit?.ownerId === ownerId)
      .map((s) => s.visitId);
    return new Set(ids);
  }

  private buildSnapshot(
    visits: Awaited<ReturnType<FieldFuelService["loadDoneVisitsForDay"]>>,
    planVisitIds: Set<string>,
  ): FuelCalculationSnapshot {
    const rows: FuelVisitSnapshotRow[] = visits.map((v) => {
      const coords = effectiveVisitLatLng(v);
      return {
        id: v.id,
        title: this.visitDisplayTitle(v),
        completedAt: v.completedAt?.toISOString() ?? null,
        lat: coords?.lat ?? v.lat,
        lng: coords?.lng ?? v.lng,
        startGpsVerification: v.startGpsVerification ?? null,
        completeGpsVerification: v.completeGpsVerification ?? null,
        includedInRoute: planVisitIds.has(v.id),
        hasCoordinates: visitHasRoutableCoordinates(v),
      };
    });
    return { visits: rows, plannedMetricsSource: null, factMetricsSource: null };
  }

  private buildWarnings(
    snapshot: FuelCalculationSnapshot,
    compensationKm: number | null,
    routeAnchors?: FuelCalculationSnapshot["routeAnchors"],
  ): string[] {
    const warnings: string[] = [];
    const withCoords = snapshot.visits.filter((v) => v.hasCoordinates);
    if (withCoords.length < 2) {
      warnings.push(
        "insufficient_completed_visits",
      );
    }
    if (routeAnchors && !routeAnchors.usesSettingsAnchors && withCoords.length >= 2) {
      warnings.push("route_anchors_not_configured");
    }
    for (const v of snapshot.visits) {
      if (!v.hasCoordinates) {
        warnings.push(`visit_no_coordinates:${v.id}`);
      }
      if (
        v.completeGpsVerification === "OUTSIDE_RADIUS" ||
        v.completeGpsVerification === "NO_FIX" ||
        v.startGpsVerification === "OUTSIDE_RADIUS" ||
        v.startGpsVerification === "NO_FIX"
      ) {
        warnings.push(`visit_gps_review:${v.id}`);
      }
    }
    if (compensationKm == null && withCoords.length >= 2) {
      warnings.push("metrics_unavailable");
    }
    return warnings;
  }

  private estimateFuel(
    compensationKm: number | null,
    profile: { fuelLitersPer100km: number; fuelPricePerLiter: Prisma.Decimal | null },
  ): { litersEstimated: number | null; amountEstimated: Prisma.Decimal | null } {
    return estimateFuelFromKm(compensationKm, profile);
  }

  private async getOrCreateProfile(ownerId: string) {
    return (
      (await this.prisma.userFieldProfile.findUnique({ where: { userId: ownerId } })) ??
      (await this.prisma.userFieldProfile.create({ data: { userId: ownerId } }))
    );
  }

  private async actorForOwner(ownerId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, email: true, role: true, fullName: true },
    });
    if (!user) {
      throw new BadRequestException("User not found");
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };
  }

  async recalculateForOwner(ownerId: string, dateStr: string) {
    const actor = await this.actorForOwner(ownerId);
    return this.recalculate(actor, dateStr);
  }

  async recalculate(actor: AuthUser | undefined, dateStr: string) {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = actor.id;
    const date = this.parseUtcDay(dateStr);

    const dayShift = await this.prisma.fieldShift.findFirst({
      where: { ownerId, date },
      orderBy: { startedAt: "desc" },
    });

    const profile = await this.getOrCreateProfile(ownerId);
    const doneVisits = await this.loadDoneVisitsForDay(ownerId, dateStr);
    const planVisitIds = await this.planVisitIdSet(ownerId, date);

    const [plannedMetrics, factVisitsMetrics, factGpsMetrics, routeAnchors, geometryBundle] =
      await Promise.all([
        this.routePlans.getRouteMetrics(dateStr, actor),
        this.routePlans.getFactRouteMetrics(dateStr, actor),
        this.routePlans.getFactGpsRouteMetrics(dateStr, actor),
        this.routePlans.getRouteAnchors(ownerId),
        this.routePlans.getRouteGeometryBundle(dateStr, actor),
      ]);

    const compensationFactKind = geometryBundle.compensationFactKind;
    const rawPolylineDistanceKm = geometryBundle.factGps.quality.rawDistanceKm ?? null;
    const snappedTrackDistanceKm =
      geometryBundle.factGps.quality.snappedDistanceKm ?? factGpsMetrics.distanceKm;
    const snapFailureReason = geometryBundle.factGps.quality.snapFailureReason ?? null;
    const gpsCompensationKm = resolveUsableGpsKm({
      snappedTrackDistanceKm,
      rawPolylineDistanceKm,
    });
    const hybridKm = geometryBundle.factVisitsGps?.distanceKm ?? null;
    const compensationKm =
      compensationFactKind === "none"
        ? null
        : compensationFactKind === "fact_gps" && gpsCompensationKm != null
          ? gpsCompensationKm
          : compensationFactKind === "fact_visits_gps" && hybridKm != null
            ? hybridKm
            : factVisitsMetrics.distanceKm;
    const actualKm = compensationKm;
    const plannedKmRaw = plannedMetrics.distanceKm;
    const plannedAssessment = assessPlannedKm({
      plannedKm: plannedKmRaw,
      factKm: compensationKm,
    });
    const plannedKm = plannedAssessment.plannedKm;
    const factMetrics = factVisitsMetrics;
    // Persist a stable source label even when visit metrics are "none" but we still
    // have compensation km from a soft GPS payout (or liters-only estimate).
    const metricsSource =
      compensationFactKind === "fact_gps" || compensationFactKind === "fact_visits_gps"
        ? "track"
        : compensationFactKind === "none"
          ? "none"
          : factVisitsMetrics.source !== "none"
            ? factVisitsMetrics.source
            : compensationKm != null
              ? "fallback"
              : "none";
    const visitCount = doneVisits.filter((v) => visitHasRoutableCoordinates(v)).length;

    const snapshot = this.buildSnapshot(doneVisits, planVisitIds);
    snapshot.plannedMetricsSource = plannedMetrics.source;
    snapshot.factMetricsSource = factVisitsMetrics.source;
    snapshot.factVisitsMetricsSource = factVisitsMetrics.source;
    snapshot.factGpsMetricsSource = factGpsMetrics.source;
    snapshot.compensationFactKind = compensationFactKind;
    snapshot.rawPolylineDistanceKm = rawPolylineDistanceKm;
    snapshot.snappedTrackDistanceKm = snappedTrackDistanceKm;
    snapshot.snapFailureReason = snapFailureReason;
    snapshot.trackKm = snappedTrackDistanceKm ?? gpsCompensationKm;
    snapshot.trackMetricsSource = resolveTrackMetricsSource(factGpsMetrics.source);
    snapshot.visitRouteKm = factVisitsMetrics.distanceKm;
    snapshot.compensationIneligibleReason =
      geometryBundle.compensationIneligibleReason ?? null;
    snapshot.coverageRatio = geometryBundle.factGps.quality.coverageRatio ?? null;
    snapshot.filteredSampleCount = geometryBundle.factGps.quality.sampleCount;
    snapshot.droppedReasons = geometryBundle.factGps.quality.droppedReasons ?? {};
    snapshot.reanchorUsed = geometryBundle.factGps.quality.reanchorUsed ?? false;
    snapshot.plannedKmDegraded = plannedAssessment.degraded;
    snapshot.routeAnchors = {
      startLabel: routeAnchors.startLabel,
      endLabel: routeAnchors.endLabel,
      hasExplicitStart: routeAnchors.hasExplicitStart,
      hasExplicitEnd: routeAnchors.hasExplicitEnd,
      usesSettingsAnchors: routeAnchors.hasExplicitStart || routeAnchors.hasExplicitEnd,
    };

    const { litersEstimated, amountEstimated } = this.estimateFuel(compensationKm, profile);

    const warnings = this.buildWarnings(snapshot, compensationKm, snapshot.routeAnchors);
    if (geometryBundle.factGps.quality.degradedReason === "gps_partial_coverage") {
      warnings.push("gps_partial_coverage");
    }
    for (const w of geometryBundle.compensationWarnings ?? []) {
      const softCode =
        w === "gps_low_coverage"
          ? "gps_low_coverage_partial_payout"
          : w === "gps_ended_before_last_visit"
            ? "gps_ended_early_partial_payout"
            : w === "gps_implausibly_short_vs_visits"
              ? "gps_implausibly_short_vs_visits"
              : w;
      if (!warnings.includes(softCode)) warnings.push(softCode);
    }
    if (plannedAssessment.warning && !warnings.includes(plannedAssessment.warning)) {
      warnings.push(plannedAssessment.warning);
    }
    if (
      litersEstimated != null &&
      amountEstimated == null &&
      (profile.fuelPricePerLiter == null || Number(profile.fuelPricePerLiter) <= 0)
    ) {
      warnings.push("fuel_price_missing_for_uah_estimate");
    }
    if (compensationFactKind === "none") {
      if (snapFailureReason === "gps_snap_loop_collapse") {
        warnings.push("gps_snap_loop_collapse");
      } else {
        warnings.push("compensation_review_required");
      }
    }
    if (compensationFactKind === "fact_visits" && geometryBundle.factGps.source !== "none") {
      const ineligibleReason = geometryBundle.compensationIneligibleReason;
      if (ineligibleReason === "gps_low_coverage") {
        warnings.push("gps_low_coverage");
      } else if (ineligibleReason === "gps_ended_before_last_visit") {
        warnings.push("gps_ended_before_last_visit");
      } else if (ineligibleReason === "gps_implausibly_short_vs_visits") {
        warnings.push("gps_implausibly_short_vs_visits");
      } else if (ineligibleReason === "gps_implausibly_long_vs_visits") {
        warnings.push("gps_implausibly_long_vs_visits");
      } else if (ineligibleReason === "track_too_short") {
        warnings.push("gps_track_too_short");
      } else if (geometryBundle.factGps.quality.degraded) {
        warnings.push("gps_track_degraded");
      } else if (ineligibleReason) {
        warnings.push("gps_track_ineligible");
      }
    }
    if (compensationFactKind === "fact_visits" && geometryBundle.factGps.source === "none") {
      warnings.push("gps_track_unavailable");
    }
    snapshot.warnings = [...warnings];

    const report = await this.prisma.fuelDayReport.upsert({
      where: { ownerId_date: { ownerId, date } },
      create: {
        ownerId,
        date,
        shiftId: dayShift?.id ?? undefined,
        plannedKm: plannedKm ?? undefined,
        actualKm: actualKm ?? undefined,
        compensationKm: compensationKm ?? undefined,
        litersEstimated: litersEstimated ?? undefined,
        // Always persist amount when estimate produced it (incl. metricsSource=none paths).
        amountEstimated: amountEstimated,
        metricsSource,
        visitCount,
        calculationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        compensationStatus: FuelCompensationStatus.DRAFT,
      },
      update: {
        shiftId: dayShift?.id ?? undefined,
        plannedKm: plannedKm,
        actualKm: actualKm,
        compensationKm: compensationKm,
        litersEstimated: litersEstimated,
        amountEstimated: amountEstimated,
        metricsSource,
        visitCount,
        calculationSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    if (dayShift && plannedKm != null && !plannedAssessment.degraded) {
      await this.prisma.fieldShift.update({
        where: { id: dayShift.id },
        data: { plannedDistanceKm: plannedKm },
      });
    }

    const refuelData = await this.refuels.listForDay(actor, dateStr, ownerId);
    return {
      report,
      profile,
      breakdown: snapshot.visits,
      warnings,
      plannedMetrics,
      factMetrics,
      factVisitsMetrics,
      factGpsMetrics,
      compensationFactKind,
      snapFailureReason: snapshot.snapFailureReason ?? geometryBundle.factGps.quality.snapFailureReason ?? null,
      rawPolylineDistanceKm: snapshot.rawPolylineDistanceKm ?? geometryBundle.factGps.quality.rawDistanceKm ?? null,
      snappedTrackDistanceKm: snapshot.snappedTrackDistanceKm ?? geometryBundle.factGps.quality.snappedDistanceKm ?? null,
      routeAnchors: snapshot.routeAnchors,
      refuels: refuelData.items,
      refuelTotals: refuelData.totals,
    };
  }

  async getOrCreateDay(actor: AuthUser | undefined, dateStr: string, ownerIdOverride?: string) {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = await this.resolveOwnerId(actor, ownerIdOverride);
    const date = this.parseUtcDay(dateStr);

    let report = await this.prisma.fuelDayReport.findUnique({
      where: { ownerId_date: { ownerId, date } },
    });

    if (!report) {
      const actorForRecalc =
        ownerId === actor.id ? actor : await this.actorForOwner(ownerId);
      return this.recalculate(actorForRecalc, dateStr);
    }

    const actorForMetrics =
      ownerId === actor.id ? actor : await this.actorForOwner(ownerId);
    const [plannedMetrics, factVisitsMetrics, factGpsMetrics, geometryBundle] = await Promise.all([
      this.routePlans.getRouteMetrics(dateStr, actorForMetrics),
      this.routePlans.getFactRouteMetrics(dateStr, actorForMetrics),
      this.routePlans.getFactGpsRouteMetrics(dateStr, actorForMetrics),
      this.routePlans.getRouteGeometryBundle(dateStr, actorForMetrics),
    ]);

    const snapshot = (report.calculationSnapshot ?? { visits: [] }) as FuelCalculationSnapshot;
    const liveKind = geometryBundle.compensationFactKind;
    const liveGpsKm = resolveUsableGpsKm({
      snappedTrackDistanceKm: factGpsMetrics.distanceKm,
      rawPolylineDistanceKm: geometryBundle.factGps.quality.rawDistanceKm ?? null,
    });
    const liveKm =
      liveKind === "none"
        ? null
        : liveKind === "fact_gps" && liveGpsKm != null
          ? liveGpsKm
          : liveKind === "fact_visits_gps"
            ? geometryBundle.factVisitsGps?.distanceKm ?? null
            : factVisitsMetrics.distanceKm;
    const storedKind = snapshot.compensationFactKind;
    const storedKm = report.compensationKm;
    const kmStale =
      storedKm == null && liveKm != null
        ? true
        : storedKm != null && liveKm == null
          ? true
          : storedKm != null && liveKm != null && Math.abs(storedKm - liveKm) > 0.05;

    if (
      (report.compensationStatus === FuelCompensationStatus.DRAFT ||
        report.compensationStatus === FuelCompensationStatus.REJECTED) &&
      (storedKind !== liveKind || kmStale)
    ) {
      const actorForRecalc =
        ownerId === actor.id ? actor : await this.actorForOwner(ownerId);
      return this.recalculate(actorForRecalc, dateStr);
    }

    const profile = await this.getOrCreateProfile(ownerId);
    const breakdown = snapshot.visits ?? [];
    const routeAnchors = await this.routePlans.getRouteAnchors(ownerId);
    const routeAnchorsSnapshot = {
      startLabel: routeAnchors.startLabel,
      endLabel: routeAnchors.endLabel,
      hasExplicitStart: routeAnchors.hasExplicitStart,
      hasExplicitEnd: routeAnchors.hasExplicitEnd,
      usesSettingsAnchors: routeAnchors.hasExplicitStart || routeAnchors.hasExplicitEnd,
    };
    const warnings = this.buildWarnings(
      { visits: breakdown, plannedMetricsSource: null, factMetricsSource: null },
      report.compensationKm,
      routeAnchorsSnapshot,
    );
    if (storedKind !== liveKind || kmStale) {
      warnings.push("report_stale");
    }

    const refuelData = await this.refuels.listForDay(actor, dateStr, ownerId);
    return {
      report,
      profile,
      breakdown,
      warnings,
      plannedMetrics,
      factMetrics: factVisitsMetrics,
      factVisitsMetrics,
      factGpsMetrics,
      compensationFactKind: geometryBundle.compensationFactKind,
      snapFailureReason: snapshot.snapFailureReason ?? geometryBundle.factGps.quality.snapFailureReason ?? null,
      rawPolylineDistanceKm: snapshot.rawPolylineDistanceKm ?? geometryBundle.factGps.quality.rawDistanceKm ?? null,
      snappedTrackDistanceKm: snapshot.snappedTrackDistanceKm ?? geometryBundle.factGps.quality.snappedDistanceKm ?? null,
      routeAnchors: routeAnchorsSnapshot,
      refuels: refuelData.items,
      refuelTotals: refuelData.totals,
    };
  }

  async patchDay(
    actor: AuthUser | undefined,
    dateStr: string,
    body: { compensationStatus?: FuelCompensationStatus; managerNote?: string | null },
    requestedOwnerId?: string,
  ) {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = await this.resolveOwnerId(actor, requestedOwnerId);
    const isSelf = ownerId === actor.id;
    const isSupervisor = actor.role === UserRole.ADMIN || actor.role === UserRole.LEAD;
    const date = this.parseUtcDay(dateStr);

    const existing = await this.prisma.fuelDayReport.findUnique({
      where: { ownerId_date: { ownerId, date } },
    });
    if (!existing) {
      throw new BadRequestException("Fuel report not found; recalculate first");
    }

    const nextStatus = body.compensationStatus;
    if (nextStatus === FuelCompensationStatus.SUBMITTED) {
      if (!isSelf) {
        throw new ForbiddenException("Only the report owner can submit");
      }
      if (
        existing.compensationStatus !== FuelCompensationStatus.DRAFT &&
        existing.compensationStatus !== FuelCompensationStatus.REJECTED
      ) {
        throw new BadRequestException("Report already submitted");
      }
    } else if (
      nextStatus === FuelCompensationStatus.APPROVED ||
      nextStatus === FuelCompensationStatus.REJECTED
    ) {
      if (!isSupervisor) {
        throw new ForbiddenException("Only a lead or admin can approve or reject");
      }
      if (existing.compensationStatus !== FuelCompensationStatus.SUBMITTED) {
        throw new BadRequestException("Report must be submitted before approval");
      }
    } else if (nextStatus === FuelCompensationStatus.PAID) {
      if (actor.role !== UserRole.ADMIN) {
        throw new ForbiddenException("Only admin can mark as paid");
      }
      if (existing.compensationStatus !== FuelCompensationStatus.APPROVED) {
        throw new BadRequestException("Report must be approved before paid");
      }
    }

    const data: Prisma.FuelDayReportUpdateInput = {};
    if (body.managerNote !== undefined) {
      if (!isSelf && !isSupervisor) {
        throw new ForbiddenException("Cannot update note for this report");
      }
      data.managerNote = body.managerNote;
    }
    if (nextStatus === FuelCompensationStatus.SUBMITTED) {
      if (existing.compensationKm == null) {
        throw new BadRequestException("Cannot submit without calculated distance");
      }
      data.compensationStatus = FuelCompensationStatus.SUBMITTED;
      data.submittedAt = new Date();
    } else if (nextStatus) {
      data.compensationStatus = nextStatus;
    }

    const report = await this.prisma.fuelDayReport.update({
      where: { id: existing.id },
      data,
    });
    const profile = await this.getOrCreateProfile(ownerId);
    return { report, profile };
  }

  async getPending(
    actor: AuthUser | undefined,
    fromStr: string,
    toStr: string,
  ) {
    if (!actor) throw new BadRequestException("User is required");
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.LEAD) {
      throw new ForbiddenException("Only lead or admin can list pending fuel reports");
    }
    const from = this.parseUtcDay(fromStr);
    const to = this.parseUtcDay(toStr);
    if (to < from) {
      throw new BadRequestException("from must be <= to");
    }
    const allowed = await getAllowedOwnerIds(this.prisma, actor);
    const ownerFilter: Prisma.FuelDayReportWhereInput["ownerId"] =
      allowed === "all" ? undefined : { in: allowed };

    const reports = await this.prisma.fuelDayReport.findMany({
      where: {
        compensationStatus: FuelCompensationStatus.SUBMITTED,
        date: { gte: from, lte: to },
        ...(ownerFilter != null ? { ownerId: ownerFilter } : {}),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ submittedAt: "desc" }, { date: "desc" }],
    });

    const refuelTotals = await this.refuels.getTotalsByReportIds(reports.map((r) => r.id));

    return {
      from: fromStr,
      to: toStr,
      items: reports.map((r) => ({
        report: r,
        owner: r.owner,
        refuelTotals: refuelTotals.get(r.id) ?? { count: 0, liters: 0, amount: 0 },
      })),
    };
  }

  private enumerateDateStrings(fromStr: string, toStr: string): string[] {
    const from = this.parseUtcDay(fromStr);
    const to = this.parseUtcDay(toStr);
    if (to < from) {
      throw new BadRequestException("from must be <= to");
    }
    const days: string[] = [];
    const cur = new Date(from);
    while (cur <= to) {
      days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
      if (days.length > MAX_EXPORT_DAYS) {
        throw new BadRequestException(`Range exceeds ${MAX_EXPORT_DAYS} days`);
      }
    }
    return days;
  }

  async getRange(
    actor: AuthUser | undefined,
    fromStr: string,
    toStr: string,
    ownerIdOverride?: string,
  ) {
    if (!actor) throw new BadRequestException("User is required");
    const ownerId = await this.resolveOwnerId(actor, ownerIdOverride);
    const days = this.enumerateDateStrings(fromStr, toStr);

    const actorForRecalc = ownerId === actor.id ? actor : await this.actorForOwner(ownerId);

    const items: Awaited<ReturnType<FieldFuelService["getOrCreateDay"]>>[] = [];
    for (const dateStr of days) {
      const date = this.parseUtcDay(dateStr);
      const existing = await this.prisma.fuelDayReport.findUnique({
        where: { ownerId_date: { ownerId, date } },
      });
      if (!existing) {
        items.push(await this.recalculate(actorForRecalc, dateStr));
      } else {
        items.push(await this.getOrCreateDay(actor, dateStr, ownerId));
      }
    }

    let totalKm = 0;
    let totalLiters = 0;
    let totalAmount = 0;
    let daysWithReport = 0;
    let daysDraft = 0;
    let daysWithoutCalc = 0;

    const dayRows = items.map((item) => {
      const r = item.report;
      if (r.compensationKm != null) {
        totalKm += r.compensationKm;
        daysWithReport += 1;
      } else {
        daysWithoutCalc += 1;
      }
      if (r.litersEstimated != null) totalLiters += r.litersEstimated;
      if (r.amountEstimated != null) totalAmount += Number(r.amountEstimated);
      if (r.compensationStatus === FuelCompensationStatus.DRAFT) daysDraft += 1;

      const refuelTotals: FuelRefuelTotals = item.refuelTotals ?? {
        count: 0,
        liters: 0,
        amount: 0,
      };

      return {
        date: r.date.toISOString().slice(0, 10),
        report: r,
        breakdown: item.breakdown,
        warnings: item.warnings,
        refuelCount: refuelTotals.count,
        refuelLitersTotal: refuelTotals.liters,
        refuelAmountTotal: refuelTotals.amount,
      };
    });

    const profile = await this.getOrCreateProfile(ownerId);
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, fullName: true, email: true },
    });

    return {
      from: fromStr,
      to: toStr,
      owner,
      profile,
      totals: {
        totalKm: Math.round(totalKm * 10) / 10,
        totalLiters: Math.round(totalLiters * 1000) / 1000,
        totalAmount: Math.round(totalAmount * 100) / 100,
        daysWithReport,
        daysDraft,
        daysWithoutCalc,
        dayCount: days.length,
      },
      days: dayRows,
    };
  }

  async exportReport(
    actor: AuthUser | undefined,
    fromStr: string,
    toStr: string,
    format: "csv" | "xlsx",
    ownerIdOverride?: string,
  ): Promise<StreamableFile> {
    const range = await this.getRange(actor, fromStr, toStr, ownerIdOverride);
    const managerName = range.owner?.fullName || range.owner?.email || "—";
    const vehicle = range.profile.vehicleLabel ?? "";

    const summaryRows = range.days.map((d) => ({
      Date: d.date,
      Manager: managerName,
      Visits: d.report.visitCount ?? 0,
      "Plan km": d.report.plannedKm ?? "",
      "Fact km": d.report.actualKm ?? "",
      "Compensation km": d.report.compensationKm ?? "",
      Liters: d.report.litersEstimated ?? "",
      "Amount UAH": d.report.amountEstimated != null ? Number(d.report.amountEstimated) : "",
      "Refuel count": d.refuelCount ?? 0,
      "Refuel liters": d.refuelLitersTotal ?? 0,
      "Refuel amount UAH": d.refuelAmountTotal ?? 0,
      Status: d.report.compensationStatus,
      Vehicle: vehicle,
      Note: d.report.managerNote ?? "",
    }));

    const visitRows: Record<string, string | number>[] = [];
    for (const d of range.days) {
      const snapshot = (d.report.calculationSnapshot ?? { visits: [] }) as FuelCalculationSnapshot;
      for (let i = 0; i < (snapshot.visits ?? []).length; i++) {
        const v = snapshot.visits[i]!;
        visitRows.push({
          Date: d.date,
          "#": i + 1,
          Visit: v.title ?? v.id,
          "Completed at": v.completedAt ?? "",
          Lat: v.lat ?? "",
          Lng: v.lng ?? "",
          "In route plan": v.includedInRoute ? "yes" : "no",
          "GPS start": v.startGpsVerification ?? "",
          "GPS complete": v.completeGpsVerification ?? "",
        });
      }
    }

    const baseName = `fuel-${fromStr}-${toStr}`;

    if (format === "csv") {
      const header = Object.keys(summaryRows[0] ?? { Date: "" }).join(",");
      const lines = summaryRows.map((row) =>
        Object.values(row)
          .map((v) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(","),
      );
      const csv = [header, ...lines].join("\n");
      const buffer = Buffer.from("\uFEFF" + csv, "utf-8");
      return new StreamableFile(buffer, {
        type: "text/csv; charset=utf-8",
        disposition: `attachment; filename="${baseName}.csv"`,
      });
    }

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "By day");
    const wsVisits = XLSX.utils.json_to_sheet(
      visitRows.length > 0 ? visitRows : [{ Date: "", Visit: "No visits" }],
    );
    XLSX.utils.book_append_sheet(wb, wsVisits, "Visits");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new StreamableFile(buffer, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename="${baseName}.xlsx"`,
    });
  }

  async getProfile(actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    return this.getOrCreateProfile(actor.id);
  }

  async updateProfile(
    actor: AuthUser | undefined,
    body: {
      fuelLitersPer100km?: number;
      fuelPricePerLiter?: number | null;
      vehicleLabel?: string | null;
      usePersonalCar?: boolean;
    },
  ) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const data: Prisma.UserFieldProfileUpdateInput = {};
    if (body.fuelLitersPer100km != null && Number.isFinite(body.fuelLitersPer100km)) {
      data.fuelLitersPer100km = body.fuelLitersPer100km;
    }
    if (body.fuelPricePerLiter !== undefined) {
      data.fuelPricePerLiter =
        body.fuelPricePerLiter == null
          ? null
          : new Prisma.Decimal(body.fuelPricePerLiter);
    }
    if (body.vehicleLabel !== undefined) {
      data.vehicleLabel = body.vehicleLabel;
    }
    if (body.usePersonalCar !== undefined) {
      data.usePersonalCar = body.usePersonalCar;
    }

    return this.prisma.userFieldProfile.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        fuelLitersPer100km: body.fuelLitersPer100km ?? undefined,
        fuelPricePerLiter:
          body.fuelPricePerLiter == null ? undefined : new Prisma.Decimal(body.fuelPricePerLiter),
        vehicleLabel: body.vehicleLabel ?? undefined,
        usePersonalCar: body.usePersonalCar ?? undefined,
      },
      update: data,
    });
  }
}
