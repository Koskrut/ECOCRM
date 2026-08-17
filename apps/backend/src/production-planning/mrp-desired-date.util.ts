import { PlanningRunLineType } from "@prisma/client";

export type DesiredDateContext = {
  now?: Date;
  monthOffset?: number | null;
  hasHardDeficit?: boolean;
  productionLeadDays?: number;
  packLeadDays?: number;
  packCycleDays?: number;
  lineType?: PlanningRunLineType;
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function endOfWeekUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? 0 : 7 - day;
  return addDays(d, diff);
}

function firstDayOfMonthOffset(from: Date, monthOffset: number): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + monthOffset, 1));
}

/** Compute desired receipt date (YYYY-MM-DD) for production/packing action lists. */
export function computeDesiredDate(ctx: DesiredDateContext): string {
  const now = ctx.now ?? new Date();
  const monthOffset = ctx.monthOffset ?? 0;
  const productionLead = ctx.productionLeadDays ?? 14;
  const packLead = ctx.packLeadDays ?? 3;
  const packCycle = ctx.packCycleDays ?? 7;

  const isPackLine =
    ctx.lineType === PlanningRunLineType.PACK || ctx.lineType === PlanningRunLineType.CAN_PACK;

  if (isPackLine) {
    return toIsoDate(addDays(now, packLead));
  }

  const minDate = addDays(now, productionLead);

  if (monthOffset <= 0) {
    if (ctx.hasHardDeficit) {
      return toIsoDate(minDate);
    }
    const weekEnd = endOfWeekUtc(now);
    const cycleDate = addDays(now, Math.min(packCycle, 14));
    const candidate = weekEnd.getTime() < cycleDate.getTime() ? weekEnd : cycleDate;
    return toIsoDate(candidate.getTime() < minDate.getTime() ? minDate : candidate);
  }

  const monthStart = firstDayOfMonthOffset(now, monthOffset);
  return toIsoDate(monthStart.getTime() < minDate.getTime() ? minDate : monthStart);
}
