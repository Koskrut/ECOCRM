"use client";

import { useEffect, useState } from "react";

type Activity = {
  id: string;
  type?: string | null;
  message?: string | null;
  text?: string | null;
  createdAt?: string;
  authorName?: string | null;
};

type ActivitiesResponse = {
  items?: Activity[];
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
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

  const load = async () => {
    setLoading(true);
  setErr(null);
    try {
      const r = await fetch(`/api/${entity}/${id}/activities`, { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error(text || `Failed (${r.status})`);
      const data = JSON.parse(text) as ActivitiesResponse | Activity[];
      const list = Array.isArray(data) ? data : data.items ?? [];
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load timeline");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, entity]);

  const addNote = async () => {
    const msg = note.trim();
    if (!msg) return;

    setPosting(true);
    try {
      // backend обычно принимает что-то типа { message } / { text } — отправим оба
      const r = await fetch(`/api/${entity}/${id}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, text: msg, type: "NOTE" }),
      });
      const t = await r.text();
      if (!r.ok) throw new Error(t || `Failed (${r.status})`);
      setNote("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setPosting(false);
    }
  };

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
                  <div className="mt-2 text-sm text-zinc-900 whitespace-pre-wrap">
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
