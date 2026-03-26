/** Mirrors apps/backend/src/analytics/utils/analytics-date.util.ts resolvePresetPeriod for UI date pickers. */

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export type RangePreset = "custom" | "week" | "month" | "quarter";

export function toInputDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Same rules as backend resolvePresetPeriod("week" | "month" | "quarter"). */
export function getDatesForPreset(preset: Exclude<RangePreset, "custom">): { dateFrom: string; dateTo: string } {
  const to = endOfDay(new Date());
  const from = startOfDay(new Date(to));
  switch (preset) {
    case "week":
      from.setDate(from.getDate() - 6);
      break;
    case "month":
      from.setDate(from.getDate() - 29);
      break;
    case "quarter":
      from.setMonth(from.getMonth() - 2);
      from.setDate(1);
      break;
    default:
      break;
  }
  return { dateFrom: toInputDate(from), dateTo: toInputDate(to) };
}

export function getDefaultCustomRange(): { dateFrom: string; dateTo: string } {
  return getDatesForPreset("month");
}
