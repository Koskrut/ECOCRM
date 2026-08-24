export function OrderPromoBadge({
  hasPromo,
  size = "sm",
  label = "Акція",
  title = "У замовленні є акційна позиція",
}: {
  hasPromo?: boolean | null;
  size?: "sm" | "xs";
  label?: string;
  title?: string;
}) {
  if (hasPromo !== true) return null;

  const sizeClass =
    size === "xs"
      ? "px-1.5 py-0 text-[10px] leading-4"
      : "px-2 py-0.5 text-[11px] leading-4";

  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center rounded-full bg-fuchsia-100 font-medium text-fuchsia-800 ${sizeClass}`}
    >
      {label}
    </span>
  );
}
