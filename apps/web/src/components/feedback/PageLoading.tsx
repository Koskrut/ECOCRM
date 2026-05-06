"use client";

import { strings } from "@/locales";

type PageLoadingProps = {
  /** Optional override; defaults to localized "Loading…". */
  label?: string;
  /** Compact inline variant (no min-height container). */
  inline?: boolean;
  className?: string;
};

export function PageLoading({ label, inline, className }: PageLoadingProps) {
  const text = label ?? strings.common.loading;
  if (inline) {
    return <span className={`text-sm text-zinc-500 ${className ?? ""}`}>{text}</span>;
  }
  return (
    <div
      className={`flex min-h-[40vh] w-full items-center justify-center text-sm text-zinc-500 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      {text}
    </div>
  );
}

/** Skeleton block for list/card placeholders. */
export function PageLoadingSkeleton() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="h-6 w-1/3 animate-pulse rounded bg-zinc-200" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    </div>
  );
}
