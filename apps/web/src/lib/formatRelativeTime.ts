import { formatDate } from "./crmDatetime";

/** Relative time in Ukrainian (matches order/lead cards). */
export function formatRelativeTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "щойно";
  if (diffMins < 60) return `${diffMins} хв тому`;
  if (diffHours < 24) return `${diffHours} год тому`;
  if (diffDays < 7) return `${diffDays} дн тому`;
  return formatDate(createdAt);
}
