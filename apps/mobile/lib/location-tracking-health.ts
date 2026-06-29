export type TrackingMode = "background" | "foreground" | "none";

export type TrackingHealthSnapshot = {
  claimedMode: TrackingMode;
  backgroundTaskStarted: boolean;
  foregroundWatchActive: boolean;
  actualMode: TrackingMode;
  healthy: boolean;
  shouldRestartBackground: boolean;
};

/** Pure health check — testable without native mocks. */
export function reconcileTrackingHealth(
  claimedMode: TrackingMode,
  backgroundTaskStarted: boolean,
  foregroundWatchActive: boolean,
): TrackingHealthSnapshot {
  let actualMode: TrackingMode = "none";
  if (backgroundTaskStarted) {
    actualMode = "background";
  } else if (foregroundWatchActive) {
    actualMode = "foreground";
  }

  const shouldRestartBackground = claimedMode === "background" && !backgroundTaskStarted;
  const missingForegroundWatch = claimedMode === "foreground" && !foregroundWatchActive;
  const claimedButDead = claimedMode !== "none" && actualMode === "none";
  const healthy = !shouldRestartBackground && !missingForegroundWatch && !claimedButDead;

  return {
    claimedMode,
    backgroundTaskStarted,
    foregroundWatchActive,
    actualMode,
    healthy,
    shouldRestartBackground,
  };
}
