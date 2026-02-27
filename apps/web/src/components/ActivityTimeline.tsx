"use client";

import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type Activity = {
  id: string;
  type?: string | null;
  message?: string | null;
  text?: string | null;
  createdAt?: string;
  authorName?: string | null;
};

type ActivitiesResponse = { items?: Activity[] } | Activity[];

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function getErrMsg(e: unknown, fallback: string) {
  const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
  return (
    anyErr?.response?.data?.message ||
    anyErr?.response?.data?.error ||
    (e instanceof Error ? e.message : fallback)
  );
}

export function ActivityTimeline({
  title = "Timeline",
  entity,
  id,
}: {
  title?: string;
  entity: "companies" | "contacts" | "orders";
  id: string;
}) {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<ActivitiesResponse>(`/api/${entity}/${id}/activities`, {
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
    void load();
  }, [load]);

  const addNote = useCallback(async () => {
    const msg = note.trim();
    if (!msg) return;

    setPosting(true);
    try {
      await apiHttp.post(`/api/${entity}/${id}/activities`, {
        message: msg,
        text: msg,
        type: "NOTE",
      });
      setNote("");
      await load();
    } catch (e) {
      alert(getErrMsg(e, "Failed to add note"));
    } finally {
      setPosting(false);
    }
  }, [entity, id, load, note]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <div className="text-sm font-semibold text-zinc-900">{title}</div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      <div className="p-4">
        <div className="flex gap-2">
          <input
            className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400"
            placeholder="Add a note…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={posting}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void addNote();
              }
            }}
          />
          <button
            type="button"
            onClick={() => void addNote()}
            disabled={posting || note.trim().length === 0}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Add
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="text-sm text-zinc-500">Loading…</div>
          ) : err ? (
            <div className="text-sm text-red-600">{err}</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-zinc-500">No activity yet</div>
          ) : (
            <div className="space-y-3">
              {items.map((a) => (
                <div key={a.id} className="rounded-md border border-zinc-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs text-zinc-500">
                      {a.type ?? "ACTIVITY"} {a.authorName ? `· ${a.authorName}` : ""}
                    </div>
                    <div className="text-xs text-zinc-500">{formatDate(a.createdAt)}</div>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-900">
                    {a.message ?? a.text ?? "(empty)"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
