/** Field shifts require Always — no silent foreground-only tracking. */
export function resolveTrackingModeAfterPermissions(
  foreground: string,
  background: string | null,
  backgroundTaskStarted: boolean,
): "background" | "none" {
  if (foreground !== "granted") return "none";
  if (background !== "granted") return "none";
  if (!backgroundTaskStarted) return "none";
  return "background";
}

export function isBackgroundLocationGranted(background: string | null): boolean {
  return background === "granted";
}
