export function ProductCardSkeleton() {
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white">
      <div className="aspect-[4/3] animate-pulse bg-zinc-200" />
      <div className="flex flex-1 flex-col p-3">
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200" />
        <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-zinc-200" />
        <div className="mt-1.5 h-5 w-1/3 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="p-3 pt-0">
        <div className="h-8 w-full animate-pulse rounded-lg bg-zinc-200" />
      </div>
    </li>
  );
}
