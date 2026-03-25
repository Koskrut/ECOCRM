"use client";

export function KpiCard({
  label,
  value,
  sublabel,
  deltaPct,
  onDrill,
}: {
  label: string;
  value: string;
  sublabel?: string;
  deltaPct?: number | null;
  /** When set, the card is focusable and opens a detail list (drill-down). */
  onDrill?: () => void;
}) {
  const delta =
    deltaPct != null && Number.isFinite(deltaPct) ? (
      <span
        className={`text-xs font-medium ${deltaPct >= 0 ? "text-emerald-600" : "text-red-600"}`}
      >
        {deltaPct >= 0 ? "+" : ""}
        {deltaPct.toFixed(1)}%
      </span>
    ) : null;

  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-zinc-900">{value}</div>
        {delta}
      </div>
      {sublabel && <div className="mt-1 text-xs text-zinc-500">{sublabel}</div>}
      {onDrill && (
        <div className="mt-2 text-xs font-medium text-indigo-600">Докладніше →</div>
      )}
    </>
  );

  if (onDrill) {
    return (
      <button
        type="button"
        onClick={() => {
          // #region agent log
          fetch("http://127.0.0.1:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "18e84e" },
            body: JSON.stringify({
              sessionId: "18e84e",
              runId: "run-1",
              hypothesisId: "H1",
              location: "KpiCard.tsx:onClick",
              message: "KPI drill click fired",
              data: { label, hasOnDrill: true },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          onDrill();
        }}
        className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-200 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        aria-label={`${label}: відкрити список`}
      >
        {body}
      </button>
    );
  }

  return <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">{body}</div>;
}
