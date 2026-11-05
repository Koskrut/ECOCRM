"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import {
  FixedDropdownPortal,
  useDismissOnOutsidePointerDown,
} from "@/components/overlays/FixedDropdownPortal";
import { helpApi, type HelpArticleSummary } from "@/lib/api/resources/help";
import { strings } from "@/locales";

type HelpRelatedProps = {
  entityType: string;
  compact?: boolean;
  /** Icon that opens the article list. For entity cards where a full section is too loud. */
  variant?: "section" | "compact" | "menu";
};

export function HelpRelated({ entityType, compact = false, variant }: HelpRelatedProps) {
  const appearance = variant ?? (compact ? "compact" : "section");
  const [items, setItems] = useState<HelpArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDismissOnOutsidePointerDown(menuOpen, () => setMenuOpen(false), anchorRef, panelRef);

  useEffect(() => {
    helpApi
      .getContext({ entityType })
      .then((res: { items: HelpArticleSummary[] }) => setItems(res.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [entityType]);

  if (loading) return null;
  if (items.length === 0) return null;

  if (appearance === "menu") {
    return (
      <div ref={anchorRef} className="relative">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-label={strings.help.relatedTitle}
          title={strings.help.relatedTitle}
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-md border border-zinc-200 p-1.5 text-zinc-600 hover:bg-zinc-50"
        >
          <BookOpen className="h-4 w-4" />
        </button>
        <FixedDropdownPortal
          open={menuOpen}
          anchorRef={anchorRef}
          panelRef={panelRef}
          minWidth={220}
          maxHeight="16rem"
        >
          <ul className="p-1">
            {items.slice(0, 8).map((item) => (
              <li key={item.id}>
                <Link
                  href={`/help/${item.slug}`}
                  className="block rounded px-2 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </FixedDropdownPortal>
      </div>
    );
  }

  if (appearance === "compact") {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <BookOpen className="h-3.5 w-3.5" />
          {strings.help.relatedTitle}
        </div>
        <ul className="space-y-1">
          {items.slice(0, 5).map((item) => (
            <li key={item.id}>
              <Link href={`/help/${item.slug}`} className="text-sm font-medium text-blue-700 hover:underline">
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <BookOpen className="h-4 w-4 text-zinc-500" />
        {strings.help.relatedTitle}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/help/${item.slug}`} className="group block">
              <span className="font-medium text-zinc-900 group-hover:text-blue-700">{item.title}</span>
              {item.excerpt ? (
                <span className="mt-0.5 block text-sm text-zinc-500">{item.excerpt}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
