"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiHttp } from "../../lib/api/client";
import type { CallTimelineItem } from "./CallCard";
import { CallCard } from "./CallCard";

type TimelineItem = CallTimelineItem;

type TimelineResponse = { items: TimelineItem[] };

type Props = {
  apiBaseUrl: string;
  contactId: string;
  entityType?: "contact" | "lead";
  /** When false, only the timeline list is shown (no Call/Meeting/Comment add form). */
  showActivityButtons?: boolean;
};

const MEETING_OUTCOME_SUCCESS = ["SUCCESS", "FOLLOW_UP"] as const;
const MEETING_OUTCOME_FAIL = ["FAILED", "NOT_RELEVANT", "NO_DECISION"] as const;

function getMeetingOutcomeBadge(
  title: string,
  type: string,
): { variant: "success" | "fail" | "plan"; label: string } | null {
  if (type !== "MEETING") return null;
  const m = title.match(/\(([^)]+)\)$/);
  const outcome = m?.[1]?.trim();
  if (!outcome) return null;
  const upper = outcome.toUpperCase();
  if (outcome === "план" || upper === "ПЛАН") return { variant: "plan", label: "План" };
  if (MEETING_OUTCOME_SUCCESS.includes(upper as (typeof MEETING_OUTCOME_SUCCESS)[number]))
    return { variant: "success", label: upper === "FOLLOW_UP" ? "Дозвон" : "Успех" };
  if (MEETING_OUTCOME_FAIL.includes(upper as (typeof MEETING_OUTCOME_FAIL)[number]))
    return {
      variant: "fail",
      label: upper === "FAILED" ? "Неудача" : upper === "NO_DECISION" ? "Без решения" : "Не релевантно",
    };
  return null;
}

function meetingTitleWithoutOutcome(title: string): string {
  return title.replace(/\s*\([^)]+\)\s*$/, "").trim() || "Встреча";
}

export function ContactTimeline({ apiBaseUrl, contactId, entityType = "contact", showActivityButtons = true }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "calls" | "missed" | "withRecording">("all");

  const timelineUrl = useMemo(
    () => entityType === "lead" ? `leads/${contactId}/activities` : `contacts/${contactId}/timeline`,
    [contactId, entityType],
  );
  const activitiesUrl = useMemo(
    () => entityType === "lead" ? `leads/${contactId}/activities` : `contacts/${contactId}/activities`,
    [contactId, entityType],
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
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-zinc-500">Фильтр:</span>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-full px-3 py-1 ${
                  filter === "all"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                } text-xs font-medium`}
              >
                Все
              </button>
              <button
                type="button"
                onClick={() => setFilter("calls")}
                className={`rounded-full px-3 py-1 ${
                  filter === "calls"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                } text-xs font-medium`}
              >
                Звонки
              </button>
              <button
                type="button"
                onClick={() => setFilter("missed")}
                className={`rounded-full px-3 py-1 ${
                  filter === "missed"
                    ? "bg-red-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                } text-xs font-medium`}
              >
                Пропущенные
              </button>
              <button
                type="button"
                onClick={() => setFilter("withRecording")}
                className={`rounded-full px-3 py-1 ${
                  filter === "withRecording"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                } text-xs font-medium`}
              >
                С записью
              </button>
            </div>

            {items
              .filter((it) => {
                const call = it.call;
                if (filter === "all") return true;
                if (filter === "calls") return it.type === "CALL";
                if (filter === "missed") {
                  if (it.type !== "CALL" || !call?.status) return false;
                  const s = call.status.toUpperCase();
                  return s.includes("MISSED");
                }
                if (filter === "withRecording") {
                  if (it.type !== "CALL" || !call) return false;
                  const status = (call.recordingStatus ?? "").toUpperCase();
                  return !!call.recordingUrl && status === "READY";
                }
                return true;
              })
              .map((it) => {
              const isExpanded = expandedId === it.id;
              const hasBody = it.body.trim().length > 0;
              const outcomeBadge = getMeetingOutcomeBadge(it.title, it.type);
              const displayTitle = outcomeBadge ? meetingTitleWithoutOutcome(it.title) : it.title;
              if (it.type === "CALL") {
                return <CallCard key={it.id} item={it} />;
              }

              return (
                <div
                  key={it.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isExpanded ? null : it.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : it.id);
                    }
                  }}
                  className="rounded-md border border-zinc-200 p-3 cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-900 flex flex-wrap items-center gap-2">
                        {displayTitle}
                        <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                          {it.type}
                        </span>
                        {outcomeBadge && (
                          <span
                            className={
                              outcomeBadge.variant === "success"
                                ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200"
                                : outcomeBadge.variant === "plan"
                                  ? "rounded bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-300"
                                  : "rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 border border-red-200"
                            }
                          >
                            {outcomeBadge.label}
                          </span>
                        )}
                        {hasBody && (
                          <span className="text-xs text-zinc-500">
                            {isExpanded ? "▼ свернуть" : "▶ результат и комментарии"}
                          </span>
                        )}
                      </div>
                      {isExpanded && hasBody && (
                        <div className="mt-2 rounded bg-zinc-50 p-2 whitespace-pre-wrap text-sm text-zinc-700 border border-zinc-100">
                          {it.body}
                        </div>
                      )}
                    </div>
                    <div className="whitespace-nowrap text-xs text-zinc-500">
                      {new Date(it.occurredAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-zinc-500">by {it.createdBy}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
