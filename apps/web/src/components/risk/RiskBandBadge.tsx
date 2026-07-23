import type { RiskBand } from "@/lib/api/resources/risk";

const BAND_CLASS: Record<RiskBand, string> = {
  LOW: "bg-emerald-100 text-emerald-800",
  MEDIUM: "bg-amber-100 text-amber-800",
  HIGH: "bg-orange-100 text-orange-800",
  CRITICAL: "bg-red-100 text-red-800",
};

export function RiskBandBadge({ band, label }: { band: RiskBand; label?: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${BAND_CLASS[band]}`}>
      {label ?? band}
    </span>
  );
}

export function EriGauge({ score, band }: { score: number; band: RiskBand }) {
  const color =
    band === "CRITICAL"
      ? "text-red-600"
      : band === "HIGH"
        ? "text-orange-600"
        : band === "MEDIUM"
          ? "text-amber-600"
          : "text-emerald-600";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-4xl font-bold tabular-nums ${color}`}>{score}</div>
      <RiskBandBadge band={band} />
    </div>
  );
}
