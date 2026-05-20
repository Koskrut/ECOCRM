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
