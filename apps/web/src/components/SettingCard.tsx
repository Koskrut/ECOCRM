"use client";

import Link from "next/link";
import type { ReactNode } from "react";

type SettingCardProps = {
  href: string;
  title: string;
  description: string;
  /** When set, the card uses an accent-colored background to highlight it. */
  accent?: boolean;
  /** Trailing content rendered to the right of the title (e.g. badge). */
  trailing?: ReactNode;
};

export function SettingCard({ href, title, description, accent, trailing }: SettingCardProps) {
  const baseClasses =
    "rounded-lg border p-5 shadow-sm transition-colors block focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";
  const colorClasses = accent
    ? "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
    : "border-zinc-200 bg-white hover:bg-zinc-50";
  const titleClasses = accent
    ? "text-sm font-semibold text-emerald-900"
    : "text-sm font-semibold text-zinc-900";
  const descClasses = accent ? "mt-1 text-sm text-emerald-800" : "mt-1 text-sm text-zinc-500";

  return (
    <Link href={href} className={`${baseClasses} ${colorClasses}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className={titleClasses}>{title}</div>
          <div className={descClasses}>{description}</div>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
    </Link>
  );
}

export function SettingCardSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-100" />
      <div className="mt-1 h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
    </div>
  );
}
