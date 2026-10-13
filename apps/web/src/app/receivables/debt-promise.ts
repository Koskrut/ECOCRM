import { todayYmdInKyiv } from "@/lib/crmDatetime";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isPromiseBroken(promiseDate: string | null | undefined, todayYmd: string): boolean {
  return Boolean(promiseDate && DATE_RE.test(promiseDate) && promiseDate < todayYmd);
}

/** Active snooze: until is strictly after Kyiv today. */
export function isSnoozeActive(
  snoozedUntil: string | null | undefined,
  todayYmd?: string,
): boolean {
  if (!snoozedUntil || !DATE_RE.test(snoozedUntil)) return false;
  const today = todayYmd ?? todayYmdInKyiv();
  return snoozedUntil > today;
}

export function collectionScore(
  row: {
    overdueAmount: number;
    overdueDays?: number | null;
    lastCommentAt: string | null;
    promiseDate?: string | null;
  },
  todayYmd?: string,
): number {
  const overdue = Number(row.overdueAmount) || 0;
  if (overdue <= 0) return 0;
  const days = Math.max(Number(row.overdueDays) || 0, 1);
  const staleMs = 7 * 24 * 60 * 60 * 1000;
  const commentTs = row.lastCommentAt ? Date.parse(row.lastCommentAt) : NaN;
  const stale =
    !row.lastCommentAt || Number.isNaN(commentTs) || Date.now() - commentTs > staleMs ? 1.6 : 1;
  const today = todayYmd ?? todayYmdInKyiv();
  const broken = isPromiseBroken(row.promiseDate, today) ? 2 : 1;
  return overdue * (1 + days / 30) * stale * broken;
}

export function pickTodayCollectQueue<
  T extends {
    overdueAmount: number;
    debtAmount: number;
    overdueDays?: number | null;
    lastCommentAt: string | null;
    promiseDate?: string | null;
    snoozedUntil?: string | null;
  },
>(
  rows: T[],
  limit = 10,
  todayYmd?: string,
): { items: T[]; paretoCount: number; overdueCovered: number; overdueTotal: number } {
  const today = todayYmd ?? todayYmdInKyiv();
  const eligible = rows.filter((r) => !isSnoozeActive(r.snoozedUntil, today));
  const overdueRows = eligible.filter((r) => r.overdueAmount > 0);
  const overdueTotal = overdueRows.reduce((sum, r) => sum + r.overdueAmount, 0);
  const ranked = [...(overdueRows.length > 0 ? overdueRows : eligible)].sort(
    (a, b) => collectionScore(b, today) - collectionScore(a, today) || b.debtAmount - a.debtAmount,
  );
  const items = ranked
    .filter((r) => collectionScore(r, today) > 0 || r.debtAmount > 0)
    .slice(0, limit);
  let covered = 0;
  let paretoCount = 0;
  const sortedOverdue = [...overdueRows].sort((a, b) => b.overdueAmount - a.overdueAmount);
  const target = overdueTotal * 0.8;
  for (const row of sortedOverdue) {
    if (paretoCount > 0 && covered >= target) break;
    covered += row.overdueAmount;
    paretoCount += 1;
  }
  const overdueCovered = items.reduce((sum, r) => sum + r.overdueAmount, 0);
  return { items, paretoCount, overdueCovered, overdueTotal };
}
