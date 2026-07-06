/** Real conversation: answered status with positive talk time. */
export function isConversation(
  status: string,
  talkSec: number | null | undefined,
  durationSec?: number | null,
): boolean {
  const s = status.toUpperCase();
  if (!s.includes("ANSWER") && s !== "PROPER") return false;
  if (talkSec != null && talkSec > 0) return true;
  if (durationSec != null && durationSec > 0) return true;
  return false;
}
