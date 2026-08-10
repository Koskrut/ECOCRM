/** English GPS strings (app default locale is uk; en used when wired). */
export const enGps = {
  trackingUnhealthy: "GPS tracking needs attention",
  backgroundTaskDeadTitle: "Background tracking stopped",
  backgroundTaskDeadHint:
    "Android will not start the GPS service while the app is minimized. Open CRM in the foreground and tap Restart tracking. This is not a battery issue if Unrestricted is already set.",
  openAppFirstTitle: "Open the app",
  openAppFirstHint:
    "To restart background GPS, bring CRM to the foreground first — Android blocks starting the service while the app is minimized.",
  restartFailedTitle: "Could not restart GPS",
  restartFailedHint:
    "Background tracking did not start. Keep CRM open and tap Restart tracking again. If that fails, close and reopen the shift. Do not open battery settings if Unrestricted is already set.",
  restartFailedForceCloseHint:
    "Background GPS did not start. Force-close CRM completely and open it again, then tap Restart tracking.",
  restartPendingTitle: "GPS service started",
  restartPendingHint:
    "Waiting for the first point on the server. Keep CRM open for 1–2 minutes — if the warning persists, check network or sign in again.",
  restartShiftConfirmTitle: "Close and reopen shift?",
  restartShiftConfirmHint:
    "This ends the current shift and starts a new one. Try Restart tracking first. Continue only if GPS is still dead or the server rejects points (wrong_day).",
  restartTrackingOk: "Background GPS is running again.",
  foregroundWatchDeadHint:
    "Foreground GPS watch stopped. Restart tracking or grant Always location permission.",
  taskFailedTitle: "Background tracking did not start",
  taskFailedHint:
    "Background GPS did not start. Open the app and tap Restart tracking. Android does not allow starting the service from a minimized window.",
  trackingForegroundOnly:
    "Tracking only while the app is open — allow Always in settings",
  backgroundHint:
    "Background location is not granted — tracking stops when the screen locks or the app is backgrounded. Open settings and choose Allow all the time.",
  backgroundRequiredTitle: "Allow all the time required",
  backgroundRequiredHint:
    "GPS only works while the app is open without Always permission. Open settings and choose Allow all the time.",
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
