import { DateTime } from "luxon";

/** Business calendar and wall-clock time for UA operations. */
export const CRM_TIME_ZONE = "Europe/Kyiv";

/**
 * Interpret YYYY-MM-DD as a calendar day in Kyiv; return UTC instants for DB range queries.
 * @throws If the string is not a real calendar date in that zone (e.g. 2026-02-31).
 */
export function kyivDayBounds(dateYmd: string): { from: Date; to: Date } {
  const start = DateTime.fromISO(dateYmd, { zone: CRM_TIME_ZONE }).startOf("day");
  if (!start.isValid || start.toISODate() !== dateYmd) {
    throw new Error("Invalid date");
  }
  const end = start.endOf("day");
  return { from: start.toJSDate(), to: end.toJSDate() };
}

export function todayYmdKyiv(now = new Date()): string {
  return DateTime.fromJSDate(now).setZone(CRM_TIME_ZONE).toISODate()!;
}

/** True if YYYY-MM-DD is after today's calendar date in Kyiv (today is not future). */
export function isKyivYmdAfterToday(dateYmd: string, now = new Date()): boolean {
  const start = DateTime.fromISO(dateYmd, { zone: CRM_TIME_ZONE }).startOf("day");
  if (!start.isValid || start.toISODate() !== dateYmd) {
    throw new Error("Invalid date");
  }
  return dateYmd > todayYmdKyiv(now);
}

/** Bucket an instant by Kyiv calendar date (for charts / grouping). */
export function instantToKyivYmd(instant: Date): string {
  return DateTime.fromJSDate(instant).setZone(CRM_TIME_ZONE).toISODate()!;
}

/** Wall time in Kyiv → absolute Date (UTC instant). */
export function kyivWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const dt = DateTime.fromObject(
    { year, month, day, hour, minute, second },
    { zone: CRM_TIME_ZONE },
  );
  if (!dt.isValid) return new Date(NaN);
  return dt.toJSDate();
}

/**
 * Inclusive range from start of (today − fullDaysBackFromToday) through end of today, Kyiv calendar.
 * Matches previous week=6 / month=29 “days back from today” behaviour.
 */
export function kyivStatsRange(fullDaysBackFromToday: number): { from: Date; to: Date } {
  const z = DateTime.now().setZone(CRM_TIME_ZONE);
  const end = z.endOf("day");
  const start = z.startOf("day").minus({ days: fullDaysBackFromToday });
  return { from: start.toJSDate(), to: end.toJSDate() };
}
