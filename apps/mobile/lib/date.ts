/** Local calendar YYYY-MM-DD (user timezone). */
export function formatLocalDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Start of local day as ISO string. */
export function startOfLocalDayIso(d = new Date()): string {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString();
}

/** End of local day as ISO string. */
export function endOfLocalDayIso(d = new Date()): string {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy.toISOString();
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
