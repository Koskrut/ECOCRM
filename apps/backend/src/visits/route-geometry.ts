export type LatLng = { lat: number; lng: number };

/** User profile route anchors (Settings → employee → «Маршрут визитов»). */
export type RouteAnchorConfig = {
  origin: LatLng | null;
  destination: LatLng | null;
  hasExplicitStart: boolean;
  hasExplicitEnd: boolean;
  startLabel: string | null;
  endLabel: string | null;
};

/** Day shift start/end for fact visit line (not profile garage loop). */
export type ShiftDayAnchors = {
  origin: LatLng | null;
  destination: LatLng | null;
  /** True when destination was set (ENDED shift). ACTIVE → false → no return-home arc. */
  hasDestination: boolean;
};

/**
 * Builds origin / destination / intermediates for Google Routes and haversine.
 * When start and/or end are configured on the user profile, visits are waypoints only.
 */
export function resolveRouteGeometry(
  points: LatLng[],
  anchors: RouteAnchorConfig,
): {
  origin: LatLng;
  destination: LatLng;
  intermediates: LatLng[];
  usesSettingsAnchors: boolean;
} {
  if (points.length === 0) {
    throw new Error("At least one point is required");
  }

  const usesSettingsAnchors = anchors.hasExplicitStart || anchors.hasExplicitEnd;

  if (!usesSettingsAnchors) {
    if (points.length === 1) {
      return {
        origin: points[0]!,
        destination: points[0]!,
        intermediates: [],
        usesSettingsAnchors: false,
      };
    }
    return {
      origin: points[0]!,
      destination: points[points.length - 1]!,
      intermediates: points.slice(1, -1),
      usesSettingsAnchors: false,
    };
  }

  if (anchors.hasExplicitStart) {
    const origin = anchors.origin!;
    const destination = anchors.hasExplicitEnd ? anchors.destination! : origin;
    return {
      origin,
      destination,
      intermediates: [...points],
      usesSettingsAnchors: true,
    };
  }

  // Only end anchor: from first visit to configured finish.
  const origin = points[0]!;
  const destination = anchors.destination!;
  return {
    origin,
    destination,
    intermediates: points.length > 1 ? points.slice(1) : [],
    usesSettingsAnchors: true,
  };
}

/**
 * Fact visit line: shift origin → DONE visits → shift destination (if ENDED).
 * Does not force return to profile garage while shift is ACTIVE.
 * One visit + origin is already a routable line.
 */
export function resolveFactRouteGeometry(
  visitPoints: LatLng[],
  shift: ShiftDayAnchors,
): {
  origin: LatLng;
  destination: LatLng;
  intermediates: LatLng[];
  ok: boolean;
} | null {
  if (!shift.origin) {
    return null;
  }
  const origin = shift.origin;

  if (shift.hasDestination && shift.destination) {
    return {
      origin,
      destination: shift.destination,
      intermediates: [...visitPoints],
      ok: true,
    };
  }

  // ACTIVE (or ENDED without dest): no forced return-home arc.
  if (visitPoints.length === 0) {
    return null;
  }
  if (visitPoints.length === 1) {
    return {
      origin,
      destination: visitPoints[0]!,
      intermediates: [],
      ok: true,
    };
  }
  return {
    origin,
    destination: visitPoints[visitPoints.length - 1]!,
    intermediates: visitPoints.slice(0, -1),
    ok: true,
  };
}
