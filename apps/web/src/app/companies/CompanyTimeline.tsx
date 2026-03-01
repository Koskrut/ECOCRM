"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";

type TimelineItem = {
  id: string;
  source: "ACTIVITY";
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
};

type ActivityItem = {
  id: string;
  type: string;
  body: string;
  occurredAt?: string;
  createdAt?: string;
  createdBy?: string;
};

type ActivitiesResponse = { items?: ActivityItem[] };

const titleFor = (type: string): string => {
  if (type === "CALL") return "Звонок";
  if (type === "MEETING") return "Встреча";
  if (type === "COMMENT") return "Комментарий";
  return type;
};

function toTimelineItem(a: ActivityItem): TimelineItem {
  const occurredAt = a.occurredAt ?? a.createdAt ?? new Date().toISOString();
  const createdAt = a.createdAt ?? occurredAt;
  return {
    id: a.id,
    source: "ACTIVITY",
    type: a.type,
    title: titleFor(a.type),
    body: a.body ?? "",
    occurredAt,
    createdAt,
    createdBy: a.createdBy ?? "system",
  };
}

type Props = {
  apiBaseUrl: string;
  companyId: string;
};

export function CompanyTimeline({ apiBaseUrl, companyId }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  // Path relative to apiHttp baseURL ("/api") to avoid /api/api/...
  const activitiesUrl = useMemo(
    () => `companies/${companyId}/activities`,
    [companyId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiHttp.get<ActivitiesResponse>(activitiesUrl);
      const raw = res.data?.items ?? [];
      const mapped = raw.map(toTimelineItem);
      mapped.sort((x, y) => +new Date(y.occurredAt) - +new Date(x.occurredAt));
      setItems(mapped);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load timeline");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activitiesUrl]);

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
      setErr(e instanceof Error ? e.message : "Failed to add activity");
    } finally {
      setSaving(false);
    }
  }, [activitiesUrl, load, mode, text]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-zinc-200 bg-white shadow-sm">
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
            placeholder={
              mode === "CALL"
                ? "Коротко: о чём был звонок?"
                : mode === "MEETING"
                  ? "Коротко: итоги встречи?"
                  : "Написать комментарий..."
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

          {err ? (
            <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          ) : null}
        </div>
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
