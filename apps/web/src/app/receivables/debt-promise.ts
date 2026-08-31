const DEBT_COMMENT_TITLE = "Дебіторка";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDebtCommentTitle(
  promiseDate?: string | null,
  promiseAmount?: number | null,
): string {
  const date = promiseDate?.trim() ?? "";
  if (!DATE_RE.test(date)) return DEBT_COMMENT_TITLE;
  const amount =
    promiseAmount != null && Number.isFinite(promiseAmount) && promiseAmount > 0
      ? ` | ${promiseAmount.toFixed(2)}`
      : "";
  return `${DEBT_COMMENT_TITLE} | ${date}${amount}`;
}

export function parseDebtCommentTitle(title: string | null | undefined): {
  promiseDate: string | null;
  promiseAmount: number | null;
} {
  if (!title?.startsWith(DEBT_COMMENT_TITLE)) {
    return { promiseDate: null, promiseAmount: null };
  }
  const parts = title.split("|").map((p) => p.trim());
  const date = parts[1] && DATE_RE.test(parts[1]) ? parts[1] : null;
  const rawAmount = parts[2] ? Number(parts[2]) : NaN;
  const promiseAmount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  return { promiseDate: date, promiseAmount };
}

export function isPromiseBroken(promiseDate: string | null | undefined, todayYmd: string): boolean {
  return Boolean(promiseDate && DATE_RE.test(promiseDate) && promiseDate < todayYmd);
}

export function collectionScore(row: {
  overdueAmount: number;
  overdueDays?: number | null;
  lastCommentAt: string | null;
  promiseDate?: string | null;
}): number {
  const overdue = Number(row.overdueAmount) || 0;
  if (overdue <= 0) return 0;
  const days = Math.max(Number(row.overdueDays) || 0, 1);
  const staleMs = 7 * 24 * 60 * 60 * 1000;
  const commentTs = row.lastCommentAt ? Date.parse(row.lastCommentAt) : NaN;
  const stale =
    !row.lastCommentAt || Number.isNaN(commentTs) || Date.now() - commentTs > staleMs ? 1.6 : 1;
  const today = new Date().toISOString().slice(0, 10);
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
  },
>(rows: T[], limit = 10): { items: T[]; paretoCount: number; overdueCovered: number; overdueTotal: number } {
  const overdueRows = rows.filter((r) => r.overdueAmount > 0);
  const overdueTotal = overdueRows.reduce((sum, r) => sum + r.overdueAmount, 0);
  const ranked = [...(overdueRows.length > 0 ? overdueRows : rows)].sort(
    (a, b) => collectionScore(b) - collectionScore(a) || b.debtAmount - a.debtAmount,
  );
  const items = ranked.filter((r) => collectionScore(r) > 0 || r.debtAmount > 0).slice(0, limit);
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
