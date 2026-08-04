/** English GPS strings (app default locale is uk; en used when wired). */
export const enGps = {
  trackingUnhealthy: "GPS tracking needs attention",
  backgroundTaskDeadTitle: "Background tracking stopped",
  backgroundTaskDeadHint:
    "The system stopped background GPS. Tap Restart tracking or close and reopen the shift. This is not a battery issue if Unrestricted is already set.",
  foregroundWatchDeadHint:
    "Foreground GPS watch stopped. Restart tracking or grant Always location permission.",
  taskFailedTitle: "Background tracking did not start",
  taskFailedHint:
    "Background GPS did not start. Try Restart tracking. If it fails again, grant Always location permission.",
  trackingForegroundOnly:
    "Tracking only while the app is open — allow Always in settings",
  backgroundHint:
    "Background location is not granted — tracking stops when the screen locks or the app is backgrounded. Open settings and choose Allow all the time.",
  gpsNotWriting: "GPS is not writing",
  gpsNotWritingHint:
    "No accepted GPS points for over 10 minutes. Restart tracking or close and reopen the shift.",
  wrongDayTitle: "Shift is outdated",
  wrongDayHint:
    "Server rejected points (wrong_day). End the shift and start a new one — otherwise the buffer retries forever.",
  sessionExpiredTitle: "Sign in again",
  sessionExpiredHint:
    "Session expired (401). GPS points are kept in the buffer — sign in to send them.",
  restartTracking: "Restart tracking",
  closeAndReopenShift: "Close and reopen shift",
  loginAgain: "Sign in again",
  batteryTitle: "Battery optimization",
  batteryHint:
    "To keep tracking in the background, disable battery optimization for this app (choose Unrestricted).",
  batteryUnknownHint:
    "Battery optimization status is unknown — confirm Unrestricted is selected for this app.",
  batteryOpen: "Open settings",
} as const;
