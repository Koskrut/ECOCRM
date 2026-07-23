"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { helpApi, type HelpArticleSummary } from "@/lib/api/resources/help";
import { strings } from "@/locales";

type HelpRelatedProps = {
  entityType: string;
  compact?: boolean;
};

export function HelpRelated({ entityType, compact = false }: HelpRelatedProps) {
  const [items, setItems] = useState<HelpArticleSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    helpApi
      .getContext({ entityType })
      .then((res: { items: HelpArticleSummary[] }) => setItems(res.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [entityType]);

  if (loading) return null;
  if (items.length === 0) return null;

  if (compact) {
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
