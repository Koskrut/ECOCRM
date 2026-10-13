import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../crm-timezone";
import { BANK_ALLOCATION_EPSILON } from "./bank-allocation.util";

export type CurrencyTotal = { currency: string; amount: number };

export type UnmatchedMonthBucket = {
  /** YYYY-MM, Kyiv calendar month. */
  month: string;
  count: number;
  totals: CurrencyTotal[];
};

export type UnmatchedMonthlySummary = {
  months: UnmatchedMonthBucket[];
  total: { count: number; totals: CurrencyTotal[] };
};

type ResidualRow = { bookedAt: Date; currency: string; remaining: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toTotals(byCurrency: Map<string, number>): CurrencyTotal[] {
  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

export function bucketUnmatchedByMonth(rows: ResidualRow[]): UnmatchedMonthlySummary {
  const months = new Map<string, { count: number; byCurrency: Map<string, number> }>();
  const totalByCurrency = new Map<string, number>();
  let totalCount = 0;

  for (const row of rows) {
    if (!(row.remaining > BANK_ALLOCATION_EPSILON)) continue;
    const month = DateTime.fromJSDate(row.bookedAt).setZone(CRM_TIME_ZONE).toFormat("yyyy-MM");
    const currency = (row.currency || "UAH").toUpperCase();
    const bucket = months.get(month) ?? { count: 0, byCurrency: new Map<string, number>() };
    bucket.count += 1;
    bucket.byCurrency.set(currency, (bucket.byCurrency.get(currency) ?? 0) + row.remaining);
    months.set(month, bucket);
    totalByCurrency.set(currency, (totalByCurrency.get(currency) ?? 0) + row.remaining);
    totalCount += 1;
  }

  return {
    months: [...months.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([month, b]) => ({ month, count: b.count, totals: toTotals(b.byCurrency) })),
    total: { count: totalCount, totals: toTotals(totalByCurrency) },
  };
}
