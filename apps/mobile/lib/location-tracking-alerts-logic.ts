/** At most one local alert per hour while FGS stays dead or zombie in background. */
export const GPS_STOPPED_NOTIFY_COOLDOWN_MS = 60 * 60 * 1000;

export type GpsStoppedNotifyReason = "task_dead" | "zombie_fgs";

export function shouldSendGpsStoppedNotification(
  mode: string | null,
  taskStarted: boolean,
  lastNotifiedAtMs: number | null,
  nowMs: number,
  reason: GpsStoppedNotifyReason = "task_dead",
): boolean {
  if (mode !== "background") return false;
  if (reason === "task_dead" && taskStarted) return false;
  if (reason === "zombie_fgs" && !taskStarted) return false;
  if (lastNotifiedAtMs != null && nowMs - lastNotifiedAtMs < GPS_STOPPED_NOTIFY_COOLDOWN_MS) {
    return false;
  }
  return true;
}
