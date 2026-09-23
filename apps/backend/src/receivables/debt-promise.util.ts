import { RECEIVABLES_COMMENT_TITLE } from "./receivables.constants";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DELAY_REASON_CODES = [
  "WAITING_ACT",
  "CLIENT_DELAY",
  "DISPUTE",
  "OTHER",
] as const;

export type DelayReasonCode = (typeof DELAY_REASON_CODES)[number];

export function isDelayReasonCode(value: string | null | undefined): value is DelayReasonCode {
  return Boolean(value && (DELAY_REASON_CODES as readonly string[]).includes(value));
}

export function isDebtCommentTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return title === RECEIVABLES_COMMENT_TITLE || title.startsWith(`${RECEIVABLES_COMMENT_TITLE} |`);
}

export function formatDebtCommentTitle(
  promiseDate?: string | null,
  promiseAmount?: number | null,
  delayReasonCode?: string | null,
): string {
  const parts = [RECEIVABLES_COMMENT_TITLE];
  const date = promiseDate?.trim() ?? "";
  if (DATE_RE.test(date)) {
    parts.push(date);
    if (promiseAmount != null && Number.isFinite(promiseAmount) && promiseAmount > 0) {
      parts.push(promiseAmount.toFixed(2));
    }
  }
  const reason = delayReasonCode?.trim() ?? "";
  if (isDelayReasonCode(reason)) {
    parts.push(`R:${reason}`);
  }
  return parts.length === 1 ? RECEIVABLES_COMMENT_TITLE : parts.join(" | ");
}

export function parseDebtCommentTitle(title: string | null | undefined): {
  promiseDate: string | null;
  promiseAmount: number | null;
  delayReasonCode: string | null;
} {
  if (!isDebtCommentTitle(title)) {
    return { promiseDate: null, promiseAmount: null, delayReasonCode: null };
  }
  const parts = (title ?? "").split("|").map((p) => p.trim());
  let promiseDate: string | null = null;
  let promiseAmount: number | null = null;
  let delayReasonCode: string | null = null;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.startsWith("R:")) {
      const code = p.slice(2);
      if (isDelayReasonCode(code)) delayReasonCode = code;
      continue;
    }
    if (DATE_RE.test(p)) {
      promiseDate = p;
      continue;
    }
    const rawAmount = Number(p);
    if (Number.isFinite(rawAmount) && rawAmount > 0) promiseAmount = rawAmount;
  }
  return { promiseDate, promiseAmount, delayReasonCode };
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
