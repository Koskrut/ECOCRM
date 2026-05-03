"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type LayoutField = {
  key: string;
  label?: string | null;
  customFieldDefinition?: { key?: string; label?: string } | null;
};
type LayoutSection = { title?: string | null; fields?: LayoutField[] };
type LayoutItem = { name?: string; sections?: LayoutSection[] };

export function ContactCardLayoutPanel({ contactId }: { contactId: string }) {
  const [layout, setLayout] = useState<LayoutItem | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    setErr(null);
    apiHttp
      .get<{ items?: LayoutItem[] }>("/layouts/runtime/list?entityType=CONTACT&type=CARD")
      .then((r) => {
        if (cancelled) return;
        const items = r.data?.items ?? [];
        setLayout(items[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setErr("Не вдалося завантажити layout");
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (err) {
    return <p className="text-xs text-red-600">{err}</p>;
  }
  if (!layout) {
    return <p className="text-xs text-zinc-500">Немає активного CARD layout для CONTACT.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs font-medium text-zinc-600">{layout.name}</p>
      {(layout.sections ?? []).map((sec, i) => (
        <div key={i} className="rounded-md border border-zinc-100 bg-zinc-50/60 p-2">
          <div className="text-xs font-semibold text-zinc-700">{sec.title ?? "Section"}</div>
          <ul className="mt-1 list-inside list-disc text-xs text-zinc-600">
            {(sec.fields ?? []).map((f) => (
              <li key={f.key}>
                {f.label?.trim() || f.customFieldDefinition?.label || f.customFieldDefinition?.key || f.key}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
