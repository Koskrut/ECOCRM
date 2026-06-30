"use client";

import type { RouteGeometryResult } from "@/lib/api/resources/visits";

export type RouteLayerKey = "planned" | "fact_visits" | "fact_gps";

const LAYER_META: Record<
  RouteLayerKey,
  { label: string; color: string; dash?: string }
> = {
  planned: { label: "План", color: "#2563eb" },
  fact_visits: { label: "Факт (визиты)", color: "#059669", dash: "8 6" },
  fact_gps: { label: "Факт (GPS)", color: "#d97706" },
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
};

const DASHED_LINE_ICONS: google.maps.PolylineOptions["icons"] = [
  {
    icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
    offset: "0",
    repeat: "12px",
  },
];

/** Polyline style from geometry source: solid for roads, dashed for straight-line fallback. */
export function routePolylineOptions(
  geom: RouteGeometryResult | null | undefined,
  layer: RouteLayerKey,
): google.maps.PolylineOptions {
  const base = ROUTE_LAYER_STYLES[layer];
  if (!geom) return base;
  if (geom.source === "fallback") {
    return { ...base, strokeOpacity: 0.75, icons: DASHED_LINE_ICONS };
  }
  if (geom.source === "raw_gps") {
    return { ...base, strokeOpacity: 0.65, strokeWeight: 2 };
  }
  return base;
}

export function routeSourceLabel(source: RouteGeometryResult["source"] | undefined): string | null {
  if (source === "google") return "по дорогах";
  if (source === "fallback") return "приблизно";
  if (source === "raw_gps") return "GPS без доріг";
  return null;
}
