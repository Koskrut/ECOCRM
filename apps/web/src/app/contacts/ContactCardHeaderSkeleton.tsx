"use client";

/** §17: placeholder для заголовка модалки контакта під час завантаження (KPI має власний скелетон у ContactKpiStrip). */

export function ContactCardHeaderTitleSkeleton() {
  return <div className="h-5 w-48 max-w-[60%] animate-pulse rounded-md bg-zinc-200" />;
}

export function ContactCardHeaderSubtitleSkeleton() {
  return (
    <div className="mt-1 space-y-2">
      <div className="h-3 w-full max-w-md animate-pulse rounded bg-zinc-100" />
      <div className="h-3 w-40 animate-pulse rounded bg-zinc-100" />
    </div>
  );
}
