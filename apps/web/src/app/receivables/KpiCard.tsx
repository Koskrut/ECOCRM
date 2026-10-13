export type KpiCardVariant = "default" | "risk" | "ok";

export function KpiCard({
  title,
  value,
  subtitle,
  variant = "default",
  active,
  onClick,
}: {
  title: string;
  value: string;
  subtitle?: string;
  variant?: KpiCardVariant;
  /** When set, card is a toggle button for filters. */
  active?: boolean;
  onClick?: () => void;
}) {
  const ring = active
    ? "border-zinc-800 bg-zinc-800 text-white shadow-sm"
    : variant === "risk"
      ? "border-red-200 bg-red-50"
      : variant === "ok"
        ? "border-emerald-200 bg-emerald-50"
        : "border-zinc-200 bg-white";
  const titleClass = active ? "text-zinc-300" : "text-zinc-500";
  const valueClass = active ? "text-white" : "text-zinc-900";
  const subClass = active ? "text-zinc-300" : "text-zinc-500";

  const inner = (
    <>
      <div className={`text-xs font-medium uppercase tracking-wide ${titleClass}`}>{title}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {subtitle ? <div className={`mt-1 text-xs ${subClass}`}>{subtitle}</div> : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border p-4 text-left shadow-sm transition hover:brightness-95 ${ring}`}
      >
        {inner}
      </button>
    );
  }

  return <div className={`rounded-xl border p-4 shadow-sm ${ring}`}>{inner}</div>;
}
