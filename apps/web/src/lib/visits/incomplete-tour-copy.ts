/** Footnote / deviation note when incompleteTour — open shift vs truncated track. */
export function incompleteTourCopyKind(
  shiftActive: boolean | undefined,
): "open_shift" | "truncated_track" {
  return shiftActive ? "open_shift" : "truncated_track";
}
