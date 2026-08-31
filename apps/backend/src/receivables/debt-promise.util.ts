import { RECEIVABLES_COMMENT_TITLE } from "./receivables.constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDebtCommentTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return title === RECEIVABLES_COMMENT_TITLE || title.startsWith(`${RECEIVABLES_COMMENT_TITLE} |`);
}

export function formatDebtCommentTitle(
  promiseDate?: string | null,
  promiseAmount?: number | null,
): string {
  const date = promiseDate?.trim() ?? "";
  if (!DATE_RE.test(date)) return RECEIVABLES_COMMENT_TITLE;
  const amount =
    promiseAmount != null && Number.isFinite(promiseAmount) && promiseAmount > 0
      ? ` | ${promiseAmount.toFixed(2)}`
      : "";
  return `${RECEIVABLES_COMMENT_TITLE} | ${date}${amount}`;
}

export function parseDebtCommentTitle(title: string | null | undefined): {
  promiseDate: string | null;
  promiseAmount: number | null;
} {
  if (!isDebtCommentTitle(title)) return { promiseDate: null, promiseAmount: null };
  const parts = (title ?? "").split("|").map((p) => p.trim());
  const date = parts[1] && DATE_RE.test(parts[1]) ? parts[1] : null;
  const rawAmount = parts[2] ? Number(parts[2]) : NaN;
  const promiseAmount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null;
  return { promiseDate: date, promiseAmount };
}

export function isPromiseForYmd(
  promiseDate: string | null | undefined,
  ymd: string,
): boolean {
  return Boolean(promiseDate && promiseDate === ymd);
}

export function isPromiseBroken(
  promiseDate: string | null | undefined,
  todayYmd: string,
): boolean {
  return Boolean(promiseDate && DATE_RE.test(promiseDate) && promiseDate < todayYmd);
}
