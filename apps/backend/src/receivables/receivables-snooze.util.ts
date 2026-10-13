import { DateTime } from "luxon";
import { CRM_TIME_ZONE } from "../crm-timezone";

export const RECEIVABLES_SNOOZE_DAYS = [1, 3, 7] as const;
export type ReceivablesSnoozeDays = (typeof RECEIVABLES_SNOOZE_DAYS)[number];

export const RECEIVABLES_SNOOZE_MAX_DAYS = 90;

/** Must NOT start with RECEIVABLES_COMMENT_TITLE, otherwise it would override the last debt comment. */
export const RECEIVABLES_SNOOZE_TITLE_PREFIX = "Відкладено (дебіторка)";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isSnoozeDays(value: unknown): value is ReceivablesSnoozeDays {
  return (RECEIVABLES_SNOOZE_DAYS as readonly unknown[]).includes(value);
}

/** Returns snooze end date (YYYY-MM-DD, Kyiv calendar) or an error message. */
export function computeSnoozeUntilYmd(
  input: { days?: unknown; until?: unknown },
  todayYmd: string,
): { ok: true; until: string } | { ok: false; error: string } {
  const today = DateTime.fromISO(todayYmd, { zone: CRM_TIME_ZONE }).startOf("day");
  if (input.until != null && input.until !== "") {
    const raw = typeof input.until === "string" ? input.until.trim() : "";
    const until = DateTime.fromISO(raw, { zone: CRM_TIME_ZONE }).startOf("day");
    if (!YMD_RE.test(raw) || !until.isValid || until.toISODate() !== raw) {
      return { ok: false, error: "until must be YYYY-MM-DD" };
    }
    if (raw <= todayYmd) return { ok: false, error: "until must be after today" };
    if (until.diff(today, "days").days > RECEIVABLES_SNOOZE_MAX_DAYS) {
      return { ok: false, error: `until must be within ${RECEIVABLES_SNOOZE_MAX_DAYS} days` };
    }
    return { ok: true, until: raw };
  }
  const days = typeof input.days === "string" ? Number(input.days) : input.days;
  if (!isSnoozeDays(days)) {
    return { ok: false, error: `days must be one of: ${RECEIVABLES_SNOOZE_DAYS.join(", ")}` };
  }
  return { ok: true, until: today.plus({ days }).toISODate()! };
}

/** `@db.Date` value → YYYY-MM-DD; expired (until <= today) → null. */
export function activeSnoozeYmd(until: Date | null | undefined, todayYmd: string): string | null {
  if (!until) return null;
  const ymd = until.toISOString().slice(0, 10);
  return ymd > todayYmd ? ymd : null;
}

export function snoozeYmdToDbDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function formatSnoozeActivityTitle(untilYmd: string): string {
  const [, m, d] = untilYmd.split("-");
  return `${RECEIVABLES_SNOOZE_TITLE_PREFIX} до ${d}.${m}`;
}
