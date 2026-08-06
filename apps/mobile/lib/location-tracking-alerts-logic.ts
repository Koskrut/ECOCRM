/** At most one local alert per hour while FGS stays dead in background. */
export const GPS_STOPPED_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

export function shouldSendGpsStoppedNotification(
  mode: string | null,
  taskStarted: boolean,
  lastNotifiedAtMs: number | null,
  nowMs: number,
): boolean {
  if (mode !== "background") return false;
  if (taskStarted) return false;
  if (lastNotifiedAtMs != null && nowMs - lastNotifiedAtMs < GPS_STOPPED_NOTIFY_COOLDOWN_MS) {
    return false;
  }
  return true;
}
