"use client";

export function ContactCardSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="h-5 w-48 animate-pulse rounded bg-zinc-200" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="h-16 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

