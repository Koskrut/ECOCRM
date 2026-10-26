export function FillBar({ used, limit }: { used: number; limit: number }) {
  const shown = Math.max(0, used);
  const pct = limit > 0 ? Math.min(100, Math.round((shown / limit) * 100)) : 0;
  const bar =
    pct >= 90 ? "h-full bg-emerald-500" : pct >= 50 ? "h-full bg-cyan-600" : "h-full bg-amber-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-zinc-600">
        <span className="tabular-nums">
          {shown} / {limit}
        </span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
        <div className={bar} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Covered units cannot exceed the ordered qty of each line, so the bar hits 100% only when the request can close. */
export function sumReceiptProgress(
  lines: Array<{ ordered: number; received: number }>,
): { ordered: number; received: number; covered: number } {
  let ordered = 0;
  let received = 0;
  let covered = 0;
  for (const line of lines) {
    const ord = Math.max(0, Math.floor(Number(line.ordered)) || 0);
    const rec = Math.max(0, Math.floor(Number(line.received)) || 0);
    ordered += ord;
    received += rec;
    covered += Math.min(ord, rec);
  }
  return { ordered, received, covered };
}
