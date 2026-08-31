import { DateTime } from "luxon";

export const CRM_TIME_ZONE = "Europe/Kyiv";
export const CRM_LOCALE = "uk-UA";

function parseInput(input: string | Date | null | undefined): DateTime | null {
  if (input == null || input === "") return null;
  if (typeof input === "string") {
    const dt = DateTime.fromISO(input, { setZone: true });
    return dt.isValid ? dt : null;
  }
  const dt = DateTime.fromJSDate(input);
  return dt.isValid ? dt : null;
}

/** Date + time in Kyiv, Ukrainian locale. */
export function formatDateTime(input: string | Date | null | undefined, empty = "—"): string {
  const dt = parseInput(input);
  if (!dt) return empty;
  return dt.setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE).toLocaleString(DateTime.DATETIME_SHORT);
}

/** Date only in Kyiv, Ukrainian locale. */
export function formatDate(input: string | Date | null | undefined, empty = "—"): string {
  const dt = parseInput(input);
  if (!dt) return empty;
  return dt.setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE).toLocaleString(DateTime.DATE_SHORT);
}

/** dd.MM.yyyy HH:mm in Kyiv. */
export function formatDateTimeNumeric(input: string | Date | null | undefined, empty = "—"): string {
  const dt = parseInput(input);
  if (!dt) return empty;
  return dt.setZone(CRM_TIME_ZONE).toFormat("dd.MM.yyyy HH:mm");
}

export function todayYmdInKyiv(): string {
  return DateTime.now().setZone(CRM_TIME_ZONE).toISODate()!;
}

export function shiftYmdInKyiv(ymd: string, deltaDays: number): string {
  return DateTime.fromISO(ymd, { zone: CRM_TIME_ZONE }).plus({ days: deltaDays }).toISODate()!;
}

export function ymdDaysAgoInKyiv(days: number): string {
  return DateTime.now().setZone(CRM_TIME_ZONE).minus({ days }).toISODate()!;
}

/** Kyiv calendar YYYY-MM-DD for a JS Date (instant). */
export function jsDateToYmdKyiv(d: Date): string {
  return DateTime.fromJSDate(d).setZone(CRM_TIME_ZONE).toISODate()!;
}

/** Start of Kyiv calendar day as JS Date (instant). */
export function kyivStartOfDayFromYmd(ymd: string): Date {
  return DateTime.fromISO(ymd, { zone: CRM_TIME_ZONE }).startOf("day").toJSDate();
}

/** ISO range for current ISO week (Mon–Sun) in Kyiv, for API filters. */
export function kyivWeekIsoBoundsUtcIsoStrings(): { from: string; to: string } {
  const now = DateTime.now().setZone(CRM_TIME_ZONE).setLocale(CRM_LOCALE);
  const start = now.startOf("week");
  const end = now.endOf("week");
  return { from: start.toJSDate().toISOString(), to: end.toJSDate().toISOString() };
}

/** ISO range for today (Kyiv calendar day) for API filters. */
export function kyivTodayIsoBoundsUtcIsoStrings(now = DateTime.now()): { from: string; to: string } {
  const day = now.setZone(CRM_TIME_ZONE);
  return { from: day.startOf("day").toJSDate().toISOString(), to: day.endOf("day").toJSDate().toISOString() };
}

/** `datetime-local` value (yyyy-MM-ddTHH:mm) in Kyiv for an ISO instant. */
export function isoToDatetimeLocalKyiv(iso: string | null | undefined): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!dt.isValid) return "";
  return dt.toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Parse `datetime-local` as Kyiv wall time → UTC ISO string. */
export function datetimeLocalKyivToIso(local: string | null | undefined): string | null {
  if (!local?.trim()) return null;
  const dt = DateTime.fromFormat(local.trim(), "yyyy-MM-dd'T'HH:mm", { zone: CRM_TIME_ZONE });
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

export type TaskDuePreset = "today" | "tomorrow" | "plus7";

/** End-of-day (18:00 Kyiv) preset for quick reschedule. */
export function kyivDuePresetIso(preset: TaskDuePreset, now = DateTime.now()): string {
  let day = now.setZone(CRM_TIME_ZONE);
  if (preset === "tomorrow") day = day.plus({ days: 1 });
  if (preset === "plus7") day = day.plus({ days: 7 });
  return day.set({ hour: 18, minute: 0, second: 0, millisecond: 0 }).toUTC().toISO()!;
}
