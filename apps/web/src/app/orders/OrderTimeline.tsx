"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";

type TimelineItem = {
  id: string;
  source: "ACTIVITY" | "STATUS";
  type: string;
  title: string;
  body: string;
  occurredAt?: string;
  at?: string;
  createdAt: string;
  createdBy: string;
};

type TimelineResponse = { items: TimelineItem[] };

type Props = {
  orderId: string;
  /** Fired when timeline item count changes (load / add activity). */
  onItemsCountChange?: (count: number) => void;
};

export function OrderTimeline({ orderId, onItemsCountChange }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const timelineUrl = useMemo(() => `orders/${orderId}/timeline`, [orderId]);
  const activitiesUrl = useMemo(() => `orders/${orderId}/activities`, [orderId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<TimelineResponse>(timelineUrl);
      const next = res.data?.items || [];
      setItems(next);
      onItemsCountChange?.(next.length);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to load timeline");
      setErr(msg);
      setItems([]);
      onItemsCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [timelineUrl, onItemsCountChange]);

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

  const placeholder =
    mode === "CALL"
      ? "Коротко: о чём был звонок?"
      : mode === "MEETING"
        ? "Коротко: итоги встречи?"
        : "Написать комментарий...";

  const formatTimelineDate = (item: TimelineItem): string => {
    const raw = item.occurredAt ?? item.at ?? item.createdAt;
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "—";
  };

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm max-lg:h-auto lg:h-full">
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
            Звонок
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
            Встреча
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
            Комментарий
          </button>
        </div>

        <div className="mt-3">
          <textarea
            className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
            rows={3}
            placeholder={placeholder}
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
              {saving ? "Сохраняю..." : "Добавить"}
            </button>

            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Обновить
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading timeline...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">Пока нет событий</div>
        ) : (
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-md border border-zinc-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">
                      {it.title}
                      <span className="ml-2 rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                        {it.source === "STATUS" ? "Статус" : it.type}
                      </span>
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{it.body}</div>
                  </div>
                  <div className="whitespace-nowrap text-xs text-zinc-500">
                    {formatTimelineDate(it)}
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
