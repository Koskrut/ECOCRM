export function DocumentsRequestedBadge({
  documentsRequested,
  size = "sm",
}: {
  documentsRequested?: boolean | null;
  size?: "sm" | "xs";
}) {
  if (documentsRequested !== true) return null;

  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-0.5";

  return (
    <span
      title="Потрібні документи"
      className={`inline-flex shrink-0 rounded font-medium bg-sky-100 text-sky-800 ${sizeClass}`}
    >
      Документи
    </span>
  );
}
