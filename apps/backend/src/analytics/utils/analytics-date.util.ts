export type ResolvedPeriod = { from: Date; to: Date };

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

/** Inclusive calendar range for preset periods ending today */
export function resolvePresetPeriod(
  preset: "week" | "month" | "quarter" | "year",
): ResolvedPeriod {
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
    case "year":
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() + 1);
      break;
    default:
      from.setDate(from.getDate() - 29);
  }
  return { from, to };
}

export function defaultLast30Days(): ResolvedPeriod {
  return resolvePresetPeriod("month");
}

export function parseCustomRange(dateFrom?: string, dateTo?: string): ResolvedPeriod | null {
  if (!dateFrom || !dateTo) return null;
  const from = startOfDay(new Date(dateFrom));
  const to = endOfDay(new Date(dateTo));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null;
  return { from, to };
}

export function resolveAnalyticsRange(q: {
  dateFrom?: string;
  dateTo?: string;
  period?: "week" | "month" | "quarter" | "year" | "custom";
}): ResolvedPeriod {
  if (q.period === "custom" || (q.dateFrom && q.dateTo)) {
    const custom = parseCustomRange(q.dateFrom, q.dateTo);
    if (custom) return custom;
  }
  if (q.period && q.period !== "custom") {
    return resolvePresetPeriod(q.period);
  }
  if (q.dateFrom) {
    const from = startOfDay(new Date(q.dateFrom));
    const to = endOfDay(new Date());
    if (!Number.isNaN(from.getTime()) && from <= to) return { from, to };
  }
  return defaultLast30Days();
}

/** Previous interval of same length (inclusive days), immediately before `from` */
export function previousPeriodOfSameLength(from: Date, to: Date): ResolvedPeriod {
  const msPerDay = 86400000;
  const days =
    Math.floor((endOfDay(to).getTime() - startOfDay(from).getTime()) / msPerDay) + 1;
  const prevTo = startOfDay(new Date(from));
  prevTo.setDate(prevTo.getDate() - 1);
  const prevToEnd = endOfDay(prevTo);
  const prevFrom = startOfDay(new Date(prevToEnd));
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  return { from: prevFrom, to: prevToEnd };
}
