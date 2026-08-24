"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

type SettingCardProps = {
  href: string;
  title: string;
  description: string;
  icon?: LucideIcon;
  /** Tailwind classes for the icon box background + text color, e.g. "bg-blue-100 text-blue-600". */
  iconClassName?: string;
  /** When set, the card uses an accent-colored background to highlight it. */
  accent?: boolean;
  /** Trailing content rendered to the right of the title (e.g. badge). */
  trailing?: ReactNode;
};

export function SettingCard({
  href,
  title,
  description,
  icon: Icon,
  iconClassName,
  accent,
  trailing,
}: SettingCardProps) {
  const baseClasses =
    "group rounded-lg border p-4 shadow-sm transition-colors block focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400";
  const colorClasses = accent
    ? "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50"
    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50";
  const titleClasses = accent
    ? "text-sm font-semibold text-emerald-900"
    : "text-sm font-semibold text-zinc-900";
  const descClasses = accent
    ? "mt-0.5 text-[13px] leading-snug text-emerald-800"
    : "mt-0.5 text-[13px] leading-snug text-zinc-500";

  return (
    <Link href={href} className={`${baseClasses} ${colorClasses}`}>
      <div className="flex items-start gap-3">
        {Icon ? (
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName ?? "bg-zinc-100 text-zinc-600"}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className={titleClasses}>{title}</div>
          <div className={descClasses}>{description}</div>
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
        <ChevronRight
          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500"
          aria-hidden
        />
      </div>
    </Link>
  );
}

export function SettingCardSkeleton() {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-zinc-200" />
        <div className="flex-1">
          <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
