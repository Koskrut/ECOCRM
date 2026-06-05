export type OrderStockReadiness = "NONE" | "PARTIAL" | "FULL";

const BADGE_CONFIG: Record<
  Exclude<OrderStockReadiness, "NONE">,
  { label: string; title: string; className: string }
> = {
  FULL: {
    label: "Є на складі",
    title: "Усі позиції в наявності — можна перевести в «Підтверджено»",
    className: "bg-emerald-100 text-emerald-800",
  },
  PARTIAL: {
    label: "Частково на складі",
    title: "Частина позицій у наявності — розділіть по залишках або дочекайтесь поставки",
    className: "bg-amber-100 text-amber-800",
  },
};

export function StockReadinessBadge({
  readiness,
  size = "sm",
}: {
  readiness?: OrderStockReadiness | null;
  size?: "sm" | "xs";
}) {
  if (!readiness || readiness === "NONE") return null;
  const cfg = BADGE_CONFIG[readiness];
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";
  return (
    <span
      title={cfg.title}
      className={`inline-flex shrink-0 rounded font-medium ${sizeClass} ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export function stockReadinessHint(readiness?: OrderStockReadiness | null): string | null {
  if (!readiness || readiness === "NONE") return null;
  return BADGE_CONFIG[readiness].title;
}
