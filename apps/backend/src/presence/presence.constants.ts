/** Last heartbeat within this window counts as reachable (team map + monitoring). */
export const PRESENCE_ONLINE_THRESHOLD_MS = 90 * 1000;

/** GPS sample older than this is considered stale on the team map. */
export const GPS_STALE_THRESHOLD_MS = 10 * 60 * 1000;
