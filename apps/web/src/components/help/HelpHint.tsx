"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { helpApi, type HelpArticleSummary } from "@/lib/api/resources/help";
import { strings } from "@/locales";

type HelpHintProps = {
  routeKey: string;
};

export function HelpHint({ routeKey }: HelpHintProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<HelpArticleSummary[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    helpApi
      .getContext({ routeKey })
      .then((res: { items: HelpArticleSummary[] }) => setItems(res.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, routeKey]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
        aria-label={strings.help.hintAria}
        title={strings.help.hintTitle}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {strings.help.contextTitle}
          </p>
          {loading ? (
            <p className="text-sm text-zinc-500">{strings.common.loading}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-zinc-500">{strings.help.contextEmpty}</p>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/help/${item.slug}`}
                    className="block rounded-lg px-2 py-1.5 text-sm text-zinc-800 hover:bg-zinc-50"
                    onClick={() => setOpen(false)}
                  >
                    <span className="font-medium">{item.title}</span>
                    {item.excerpt ? (
                      <span className="mt-0.5 block line-clamp-2 text-xs text-zinc-500">{item.excerpt}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/help"
            className="mt-3 block text-center text-xs font-medium text-blue-700 hover:underline"
            onClick={() => setOpen(false)}
          >
            {strings.help.openHub}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
