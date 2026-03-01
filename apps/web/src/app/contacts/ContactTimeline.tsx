"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";

type TimelineItem = {
  id: string;
  source: "ACTIVITY";
  type: string; // COMMENT | CALL | MEETING
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
};

type TimelineResponse = { items: TimelineItem[] };

type Props = {
  apiBaseUrl: string;
  contactId: string;
  /** When false, only the timeline list is shown (no Call/Meeting/Comment add form). */
  showActivityButtons?: boolean;
};

export function ContactTimeline({ apiBaseUrl, contactId, showActivityButtons = true }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const timelineUrl = useMemo(
    () => `${apiBaseUrl}/contacts/${contactId}/timeline`,
    [apiBaseUrl, contactId],
  );
  const activitiesUrl = useMemo(
    () => `${apiBaseUrl}/contacts/${contactId}/activities`,
    [apiBaseUrl, contactId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<TimelineResponse>(timelineUrl);
      const data = res.data;
      setItems(data?.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load timeline");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [timelineUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const addActivity = useCallback(async () => {
    if (!text.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await apiHttp.post(activitiesUrl, { type: mode, body: text.trim() });
      setText("");
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to add activity");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }, [activitiesUrl, load, mode, text]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm">
      {showActivityButtons && (
        <div className="border-b border-zinc-200 p-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMode("CALL")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                mode === "CALL"
                  ? "bg-accent-gradient text-white border-transparent"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Call
            </button>
            <button
              type="button"
              onClick={() => setMode("MEETING")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                mode === "MEETING"
                  ? "bg-accent-gradient text-white border-transparent"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Meeting
            </button>
            <button
              type="button"
              onClick={() => setMode("COMMENT")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium border ${
                mode === "COMMENT"
                  ? "bg-accent-gradient text-white border-transparent"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              Comment
            </button>
          </div>

          <div className="mt-3">
            <textarea
              className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
              rows={3}
              placeholder={
                mode === "CALL"
                  ? "Briefly: what was the call about?"
                  : mode === "MEETING"
                    ? "Briefly: meeting outcome?"
                    : "Write a comment..."
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                disabled={saving || !text.trim()}
                onClick={() => void addActivity()}
                className="btn-primary py-1.5"
              >
                {saving ? "Saving…" : "Add"}
              </button>

              <button
                type="button"
                onClick={() => void load()}
                className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Refresh
              </button>
            </div>

            {err ? (
              <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading timeline...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">No events yet</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">
                      {it.title}
                      <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                        {it.type}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{it.body}</div>
                  </div>
                  <div className="whitespace-nowrap text-xs text-zinc-500">
                    {new Date(it.occurredAt).toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 text-xs text-zinc-500">by {it.createdBy}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
