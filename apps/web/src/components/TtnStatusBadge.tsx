"use client";

import { getTtnStatusPresentation } from "@/lib/np-ttn-status";

type TtnStatusBadgeProps = {
  statusCode?: string | null;
  statusText?: string | null;
  /** Compact mode for inline rows */
  size?: "sm" | "md";
};

export function TtnStatusBadge({ statusCode, statusText, size = "sm" }: TtnStatusBadgeProps) {
  const presentation = getTtnStatusPresentation(statusCode, statusText);
  if (!presentation) return null;

  const sizeClass =
    size === "md"
      ? "px-2.5 py-0.5 text-xs"
      : "px-2 py-0.5 text-[11px]";

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full font-medium ${sizeClass} ${presentation.color}`}
      title={presentation.tooltip ?? undefined}
    >
      <span className="truncate">{presentation.label}</span>
    </span>
  );
}
