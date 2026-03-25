"use client";

import Link from "next/link";

export function AttentionBlock({
  title,
  items,
  emptyText,
  hrefForItem,
}: {
  title: string;
  items: { id: string; label: string; meta?: string }[];
  emptyText?: string;
  hrefForItem?: (id: string) => string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">{emptyText ?? "Немає записів"}</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100">
          {items.map((it) => {
            const inner = (
              <>
                <span className="font-medium text-zinc-800">{it.label}</span>
                {it.meta && <span className="ml-2 text-xs text-zinc-500">{it.meta}</span>}
              </>
            );
            return (
              <li key={it.id} className="py-2">
                {hrefForItem ? (
                  <Link
                    href={hrefForItem(it.id)}
                    className="text-sm text-accent-600 hover:underline"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="text-sm">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
