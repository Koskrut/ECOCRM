/** Choose which planned polyline to draw: saved OSRM bundle vs unsaved preview. */
export function selectPlannedMapGeometry<T>(opts: {
  hasUnsavedPlanOrder: boolean;
  preview: T | null;
  saved: T | null;
}): T | null {
  if (opts.hasUnsavedPlanOrder) return opts.preview;
  return opts.saved;
}
