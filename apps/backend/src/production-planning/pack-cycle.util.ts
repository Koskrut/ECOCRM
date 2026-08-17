import { DateTime } from "luxon";
import { CRM_TIME_ZONE, instantToKyivYmd, kyivDayBounds } from "../crm-timezone";

/** Friday of the current packing week (Kyiv). Mon–Thu → last Friday; Fri–Sun → this Friday. */
export function packCycleStartYmdKyiv(now = new Date()): string {
  const z = DateTime.fromJSDate(now).setZone(CRM_TIME_ZONE).startOf("day");
  const daysFromFriday = (z.weekday - 5 + 7) % 7;
  return z.minus({ days: daysFromFriday }).toISODate()!;
}

export function packCycleStartUtc(now = new Date()): Date {
  return kyivDayBounds(packCycleStartYmdKyiv(now)).from;
}

export function packCycleEndUtc(cycleStartYmd: string, packCycleDays: number): Date {
  return DateTime.fromISO(cycleStartYmd, { zone: CRM_TIME_ZONE })
    .startOf("day")
    .plus({ days: packCycleDays })
    .toJSDate();
}

/** Parse operator date or default to this week's Friday (Kyiv). */
export function resolvePackCycleStartUtc(cycleStartIso?: string, now = new Date()): Date {
  if (!cycleStartIso?.trim()) return packCycleStartUtc(now);
  const trimmed = cycleStartIso.trim();
  const ymd = /^\d{4}-\d{2}-\d{2}/.exec(trimmed)?.[0];
  if (ymd) return kyivDayBounds(ymd).from;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid cycleStart");
  }
  return kyivDayBounds(instantToKyivYmd(parsed)).from;
}

/** Old shipped pair (14d / 3500) → weekly Friday 2000 kits. */
export function migrateLegacyPackDefaults(
  packCycleDays: number | undefined,
  packCapacityPerCycle: number | undefined,
  next: { packCycleDays: number; packCapacityPerCycle: number },
): { packCycleDays: number; packCapacityPerCycle: number } {
  if (packCycleDays === 14 && packCapacityPerCycle === 3500) return next;
  return {
    packCycleDays: packCycleDays ?? next.packCycleDays,
    packCapacityPerCycle: packCapacityPerCycle ?? next.packCapacityPerCycle,
  };
}
