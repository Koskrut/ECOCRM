"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** CTA button or link. */
  action?: ReactNode;
  /** Compact variant: smaller padding, used inside cards/modals. */
  compact?: boolean;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-white text-center ${
        compact ? "px-4 py-6" : "px-6 py-12"
      } ${className ?? ""}`}
    >
      {Icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      ) : null}
      <div className={`font-medium text-zinc-900 ${compact ? "text-sm" : "text-base"}`}>
        {title}
      </div>
      {description ? <p className="mt-1 max-w-md text-sm text-zinc-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function NotFoundInline({ message }: { message?: string }) {
  return <div className="text-sm text-zinc-500">{message ?? "—"}</div>;
}
