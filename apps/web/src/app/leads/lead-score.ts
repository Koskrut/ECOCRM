/** Lead Meta form score is typically 0–7 (deltas), not 0–100. */
export function leadScoreTone(score: number): string {
  if (score >= 5) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 2) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-zinc-200 bg-zinc-100 text-zinc-600";
}
