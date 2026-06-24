import { FileText } from "lucide-react";

export function DocumentsRequestedBadge({
  documentsRequested,
  size = "sm",
}: {
  documentsRequested?: boolean | null;
  size?: "sm" | "xs";
}) {
  if (documentsRequested !== true) return null;

  const iconClass = size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <span title="Потрібні документи" className="inline-flex shrink-0 text-sky-600">
      <FileText className={iconClass} />
    </span>
  );
}
