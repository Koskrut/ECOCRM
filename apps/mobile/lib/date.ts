/** Calendar YYYY-MM-DD in Europe/Kyiv (aligns with backend shift.date). */
export function formatKyivDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Kyiv",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

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

/** Parse YYYY-MM-DD to local Date (midnight). */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysToDateKey(key: string, days: number): string {
  return formatLocalDateKey(addDays(parseDateKey(key), days));
}

export function formatMonthYear(d: Date): string {
  const raw = d.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export type MonthGridCell = { dateKey: string | null; inMonth: boolean };

/** Monday-first calendar grid for the month containing `monthAnchorKey`. */
export function monthGridCells(monthAnchorKey: string): MonthGridCell[] {
  const anchor = parseDateKey(monthAnchorKey);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const lastDay = daysInMonth(year, month);
  let startPad = first.getDay() - 1;
  if (startPad < 0) startPad = 6;

  const cells: MonthGridCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ dateKey: null, inMonth: false });
  for (let day = 1; day <= lastDay; day++) {
    cells.push({ dateKey: formatLocalDateKey(new Date(year, month, day)), inMonth: true });
  }
  while (cells.length % 7 !== 0) cells.push({ dateKey: null, inMonth: false });
  return cells;
}

export function isSameDateKey(a: string, b: string): boolean {
  return a === b;
}

export function shortWeekdayLabel(dateKey: string): string {
  return parseDateKey(dateKey).toLocaleDateString("uk-UA", { weekday: "short" });
}

export function dayMonthLabel(dateKey: string): string {
  const raw = parseDateKey(dateKey).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  return raw.replace(".", "");
}

/** Human-readable date in Ukrainian, e.g. «Пʼятниця, 26 червня». */
export function formatHumanDate(d = new Date()): string {
  const raw = d.toLocaleDateString("uk-UA", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Minutes from now until the given ISO timestamp (negative = past). */
export function minutesUntil(iso: string, now = new Date()): number {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

export type DayPeriod = "morning" | "afternoon" | "evening";

export function dayPeriod(d = new Date()): DayPeriod {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}
