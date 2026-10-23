const KYIV = "Europe/Kyiv";

const WEEKDAY: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type KyivParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function kyivParts(date: Date): KyivParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: KYIV,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const map: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    weekday: WEEKDAY[map.weekday] ?? 0,
  };
}

export function kyivDateString(date: Date): string {
  const p = kyivParts(date);
  const month = String(p.month).padStart(2, "0");
  const day = String(p.day).padStart(2, "0");
  return `${p.year}-${month}-${day}`;
}

export function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = parseYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** UTC instant of 00:00 in Europe/Kyiv on that calendar day. */
export function kyivMidnightUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = kyivParts(guess);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

export function periodBounds(from: string, to: string): { start: Date; end: Date } {
  return { start: kyivMidnightUtc(from), end: kyivMidnightUtc(addDaysYmd(to, 1)) };
}

export function defaultPeriod(now: Date, days: number): { from: string; to: string } {
  const to = kyivDateString(now);
  return { from: addDaysYmd(to, -(days - 1)), to };
}

export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000) + 1;
  const prevTo = addDaysYmd(from, -1);
  return { from: addDaysYmd(prevTo, -(length - 1)), to: prevTo };
}

export function dayMatured(ymd: string, windowDays: number, now: Date): boolean {
  return addDaysYmd(ymd, windowDays) <= kyivDateString(now);
}

export function leadMatured(createdAt: Date, windowDays: number, now: Date): boolean {
  return dayMatured(kyivDateString(createdAt), windowDays, now);
}

export function paymentInsideWindow(paidAt: Date, leadCreatedAt: Date, windowDays: number): boolean {
  const start = leadCreatedAt.getTime();
  const end = start + windowDays * 86_400_000;
  const paid = paidAt.getTime();
  return paid >= start && paid <= end;
}

function weekdayOfYmd(ymd: string): number {
  const noon = new Date(kyivMidnightUtc(ymd).getTime() + 12 * 3_600_000);
  return kyivParts(noon).weekday;
}

const OPEN_MIN = 9 * 60;
const CLOSE_MIN = 18 * 60;

/** Working minutes between two instants: Mon–Fri 09:00–18:00 Europe/Kyiv. */
export function businessMinutesBetween(start: Date, end: Date): number {
  if (end.getTime() <= start.getTime()) return 0;
  const startParts = kyivParts(start);
  const endParts = kyivParts(end);
  let ymd = kyivDateString(start);
  const endYmd = kyivDateString(end);
  let total = 0;
  for (let guard = 0; ymd <= endYmd && guard < 4000; guard += 1) {
    const dayStart = ymd === kyivDateString(start) ? startParts.hour * 60 + startParts.minute : 0;
    const dayEnd = ymd === endYmd ? endParts.hour * 60 + endParts.minute : 24 * 60;
    const weekday = weekdayOfYmd(ymd);
    if (weekday >= 1 && weekday <= 5) {
      const from = Math.max(dayStart, OPEN_MIN);
      const to = Math.min(dayEnd, CLOSE_MIN);
      if (to > from) total += to - from;
    }
    ymd = addDaysYmd(ymd, 1);
  }
  return total;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const left = sorted[mid - 1] ?? 0;
  const right = sorted[mid] ?? 0;
  return (left + right) / 2;
}
