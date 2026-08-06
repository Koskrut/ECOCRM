/** Human-readable «N min ago» for diagnostics (Kyiv field ops). */
export function formatMinutesAgo(iso: string | null | undefined, nowMs = Date.now()): string {
  if (!iso) return "—";
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "—";
  const diffMs = Math.max(0, nowMs - at);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "<1 хв";
  if (min < 60) return `${min} хв`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h} год ${rem} хв` : `${h} год`;
}

export function batteryOptimizationLabel(
  status: "restricted" | "unrestricted" | "unknown" | "module_unavailable",
  rawIgnoring?: boolean | null,
  moduleLoaded?: boolean,
): string {
  if (rawIgnoring === true) return "Unrestricted (API)";
  if (rawIgnoring === false) return "Restricted (API)";
  if (moduleLoaded === false) return "module unavailable";
  switch (status) {
    case "unrestricted":
      return "Unrestricted";
    case "restricted":
      return "Restricted";
    case "module_unavailable":
      return "native module unavailable";
    default:
      return "unknown — module not ready or API null";
  }
}
