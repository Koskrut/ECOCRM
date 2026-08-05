"use client";

import type { RouteGeometryLayer, RouteGeometryResult } from "@/lib/api/resources/visits";

export type RouteLayerKey = "planned" | "fact_visits" | "fact_gps" | "fact_visits_gps";

const LAYER_META: Record<
  RouteLayerKey,
  { label: string; color: string; dash?: string }
> = {
  planned: { label: "План", color: "#2563eb" },
  fact_visits: { label: "Факт (візити)", color: "#059669", dash: "8 6" },
  fact_gps: { label: "Факт (GPS)", color: "#d97706" },
  fact_visits_gps: { label: "Факт (гібрид)", color: "#7c3aed", dash: "6 4" },
};

export function RouteLayerControls({
  layers,
  onToggle,
  disabled,
}: {
  layers: Record<RouteLayerKey, boolean>;
  onToggle: (key: RouteLayerKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(Object.keys(LAYER_META) as RouteLayerKey[]).map((key) => {
        const meta = LAYER_META[key];
        const on = layers[key];
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onToggle(key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              on
                ? "border-zinc-300 bg-white text-zinc-900 shadow-sm"
                : "border-transparent bg-zinc-100 text-zinc-500"
            } disabled:opacity-50`}
          >
            <span
              className="inline-block h-0.5 w-4 rounded-full"
              style={{
                backgroundColor: on ? meta.color : "#a1a1aa",
                ...(meta.dash && on
                  ? {
                      backgroundImage: `repeating-linear-gradient(90deg, ${meta.color} 0, ${meta.color} 4px, transparent 4px, transparent 7px)`,
                      backgroundColor: "transparent",
                      height: 3,
                    }
                  : {}),
              }}
            />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export const ROUTE_LAYER_STYLES: Record<RouteLayerKey, google.maps.PolylineOptions> = {
  planned: { strokeColor: "#2563eb", strokeOpacity: 0.9, strokeWeight: 4 },
  fact_visits: { strokeColor: "#059669", strokeOpacity: 0.85, strokeWeight: 4 },
  fact_gps: { strokeColor: "#d97706", strokeOpacity: 0.9, strokeWeight: 3 },
  fact_visits_gps: { strokeColor: "#7c3aed", strokeOpacity: 0.88, strokeWeight: 3 },
};

const DASHED_LINE_ICONS: google.maps.IconSequence[] = [
  {
    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
    offset: "0",
    repeat: "12px",
  },
];

function directionArrowIcons(strokeColor: string): google.maps.IconSequence[] {
  return [
    {
      icon: {
        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
        scale: 3,
        strokeColor,
        fillColor: strokeColor,
        fillOpacity: 1,
        strokeWeight: 1,
      },
      offset: "50%",
      repeat: "80px",
    },
  ];
}

/** Polyline style from geometry source: solid for roads, dashed for straight-line fallback. */
export function routePolylineOptions(
  geom: RouteGeometryResult | RouteGeometryLayer | null | undefined,
  layer: RouteLayerKey,
): google.maps.PolylineOptions {
  const base = ROUTE_LAYER_STYLES[layer];
  if (!geom) return base;

  const withArrows =
    layer === "planned" || layer === "fact_visits"
      ? { ...base, icons: directionArrowIcons(base.strokeColor ?? "#2563eb") }
      : base;

  const gpsStitchGaps =
    layer === "fact_gps" &&
    geom.source === "osrm" &&
    (geom.quality?.hasUnfilledGaps === true ||
      geom.quality?.degradedReason === "gps_stitch_gaps" ||
      (geom.quality?.maxStitchGapKm != null && geom.quality.maxStitchGapKm > 1));

  if (gpsStitchGaps) {
    return {
      ...withArrows,
      strokeOpacity: 0.55,
      icons: [...(withArrows.icons ?? []), ...DASHED_LINE_ICONS],
    };
  }

  if (geom.source === "fallback") {
    return {
      ...withArrows,
      strokeOpacity: 0.75,
      icons: [...(withArrows.icons ?? []), ...DASHED_LINE_ICONS],
    };
  }
  if (geom.source === "raw_gps") {
    return { ...base, strokeOpacity: 0.65, strokeWeight: 2 };
  }
  return withArrows;
}

type RouteSourceQuality = RouteGeometryResult["quality"] | RouteGeometryLayer["quality"];

export function routeSourceLabel(
  source: RouteGeometryResult["source"] | undefined,
  quality?: RouteSourceQuality,
  kind?: RouteGeometryResult["kind"],
): string | null {
  if (source === "osrm") {
    if (kind === "fact_gps") {
      if (
        quality?.hasUnfilledGaps === true ||
        quality?.degradedReason === "gps_stitch_gaps" ||
        (quality?.maxStitchGapKm != null && quality.maxStitchGapKm > 1)
      ) {
        return "osrm_match · пропуски";
      }
      return "osrm_match";
    }
    return "osrm_route";
  }
  if (source === "fallback") return "приблизно";
  if (source === "raw_gps") return "GPS без доріг";
  if (source === "none") return "none";
  return null;
}
