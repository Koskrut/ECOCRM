"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

export type TimelineItem = {
  id: string;
  type?: string | null;
  text?: string | null;
  createdAt: string;
  createdBy?: { id: string; email?: string | null; fullName?: string | null } | null;
};

type Props = {
  entity: "companies" | "contacts" | "orders";
  id: string;
};

type Resp = { items?: TimelineItem[] } | TimelineItem[];

function getErrMsg(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

export function EntityTimeline({ entity, id }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<Resp>(`/api/${entity}/${id}/activities`, {
        headers: { "Cache-Control": "no-store" },
      });
      const data = res.data;
      const list = Array.isArray(data) ? data : (data?.items ?? []);
      setItems(list);
    } catch (e) {
      setErr(getErrMsg(e, "Failed to load timeline"));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [entity, id]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  if (loading) return <div className="text-sm text-zinc-500">Loading timeline…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;
  if (items.length === 0) return <div className="text-sm text-zinc-500">No activity yet.</div>;

  return (
    <div className="space-y-3">
      {items.map((it) => (
        <div key={it.id} className="rounded-lg border border-zinc-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-500">{new Date(it.createdAt).toLocaleString()}</div>
            <div className="text-xs text-zinc-500">
              {it.createdBy?.fullName || it.createdBy?.email || "System"}
            </div>
          </div>
          <div className="mt-2 text-sm text-zinc-900">{it.text || it.type || "—"}</div>
        </div>
      ))}
    </div>
  );
}
