"use client";

import { DateTime } from "luxon";
import { Calendar, MessageCircle, Pencil, Phone, Pin, PinOff, Trash2 } from "lucide-react";
import { CRM_LOCALE, CRM_TIME_ZONE, formatDateTime, jsDateToYmdKyiv } from "@/lib/crmDatetime";
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

const MEETING_OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "План", label: "План" },
  { value: "SUCCESS", label: "Успех" },
  { value: "FOLLOW_UP", label: "Дозвон" },
  { value: "FAILED", label: "Неудача" },
  { value: "NO_DECISION", label: "Без решения" },
  { value: "NOT_RELEVANT", label: "Не релевантно" },
];

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

function dateGroupLabelFromYmd(ymd: string): string {
  const dt = DateTime.fromISO(ymd, { zone: CRM_TIME_ZONE });
  if (!dt.isValid) return ymd;
  const now = DateTime.now().setZone(CRM_TIME_ZONE);
  if (dt.toISODate() === now.toISODate()) return "Сьогодні";
  if (dt.toISODate() === now.minus({ days: 1 }).toISODate()) return "Вчора";
  return dt.setLocale(CRM_LOCALE).toFormat("d MMMM");
}

export function ContactTimeline({ apiBaseUrl, contactId, entityType = "contact", showActivityButtons = true }: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [mode, setMode] = useState<"COMMENT" | "CALL" | "MEETING">("COMMENT");
  const [meetingOutcome, setMeetingOutcome] = useState<string>("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "calls" | "missed" | "withRecording">("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
      const payload: { type: string; body: string; title?: string } = {
        type: mode,
        body: text.trim(),
      };
      if (mode === "MEETING" && meetingOutcome.trim()) {
        payload.title = `Встреча (${meetingOutcome.trim()})`;
      }
      await apiHttp.post(activitiesUrl, payload);
      setText("");
      setMeetingOutcome("");
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to add activity");
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }, [activitiesUrl, load, mode, meetingOutcome, text]);

  const updateActivity = useCallback(
    async (activityId: string, dto: { body?: string; title?: string; pinnedAt?: string | null }) => {
      setActionLoading(true);
      try {
        await apiHttp.patch(`activities/${activityId}`, dto);
        await load();
        setEditingId(null);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to update");
        setErr(msg);
      } finally {
        setActionLoading(false);
      }
    },
    [load],
  );

  const deleteActivity = useCallback(
    async (activityId: string) => {
      setActionLoading(true);
      try {
        await apiHttp.delete(`activities/${activityId}`);
        await load();
        setConfirmDeleteId(null);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to delete");
        setErr(msg);
      } finally {
        setActionLoading(false);
      }
    },
    [load],
  );

  const startEdit = useCallback((it: TimelineItem) => {
    setEditingId(it.id);
    setEditBody(it.body ?? "");
    setEditTitle(it.title ?? "");
  }, []);

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

          {mode === "MEETING" && (
            <div className="mt-3">
              <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                Результат встречи
              </label>
              <select
                value={meetingOutcome}
                onChange={(e) => setMeetingOutcome(e.target.value)}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:ring-2 focus:ring-zinc-200"
              >
                <option value="">— обратити —</option>
                {MEETING_OUTCOME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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

            {(() => {
              const filtered = items.filter((it) => {
                const call = it.call;
                if (filter === "all") return true;
                if (filter === "calls")
                  return it.type === "CALL" || it.type === "MANUAL_CALL";
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
              });
              const pinned = filtered.filter((it) => it.pinnedAt);
              const rest = filtered.filter((it) => !it.pinnedAt);
              const byDateKey = new Map<string, typeof rest>();
              for (const it of rest) {
                const key = jsDateToYmdKyiv(new Date(it.occurredAt));
                if (!byDateKey.has(key)) byDateKey.set(key, []);
                byDateKey.get(key)!.push(it);
              }
              const sortedDateKeys = Array.from(byDateKey.keys()).sort((a, b) => b.localeCompare(a));
              const renderItem = (it: TimelineItem) => {
                const isExpanded = expandedId === it.id;
                const hasBody = it.body.trim().length > 0;
                const outcomeBadge = getMeetingOutcomeBadge(it.title, it.type);
                const displayTitle = outcomeBadge ? meetingTitleWithoutOutcome(it.title) : it.title;
                if (it.type === "CALL") {
                  const isEditingCall = editingId === it.id;
                  const isConfirmDeleteCall = confirmDeleteId === it.id;
                  if (isEditingCall) {
                    return (
                      <div
                        key={it.id}
                        className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm flex gap-3"
                      >
                        <div className="flex shrink-0 items-center pt-0.5 text-emerald-600">
                          <Phone className="h-5 w-5" aria-hidden />
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <p className="text-sm font-medium text-zinc-700">Звонок — заметка</p>
                          <textarea
                            className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                            rows={3}
                            value={editBody}
                            onChange={(e) => setEditBody(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                void updateActivity(it.id, { body: editBody.trim() });
                              }}
                              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                            >
                              Зберегти
                            </button>
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(null);
                              }}
                              className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                            >
                              Скасувати
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <CallCard
                      key={it.id}
                      item={it}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedId(isExpanded ? null : it.id)}
                      onEdit={() => startEdit(it)}
                      onDelete={() => setConfirmDeleteId(it.id)}
                      showDeleteConfirm={isConfirmDeleteCall}
                      onConfirmDelete={() => void deleteActivity(it.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      actionLoading={actionLoading}
                    />
                  );
                }
                const Icon =
                  it.type === "MANUAL_CALL" ? Phone : it.type === "COMMENT" ? MessageCircle : Calendar;
                const iconColor =
                  it.type === "MANUAL_CALL"
                    ? "text-amber-600"
                    : it.type === "COMMENT"
                      ? "text-sky-600"
                      : "text-violet-600";
                const isEditing = editingId === it.id;
                const isConfirmDelete = confirmDeleteId === it.id;
                const canPin =
                  it.type === "COMMENT" || it.type === "MEETING" || it.type === "MANUAL_CALL";
                const isPinned = !!it.pinnedAt;

                if (isEditing) {
                  return (
                    <div
                      key={it.id}
                      className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm flex gap-3"
                    >
                      <div className={`flex shrink-0 items-center pt-0.5 ${iconColor}`}>
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <textarea
                          className="w-full rounded-md border border-zinc-200 p-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
                          rows={3}
                          value={editBody}
                          onChange={(e) => setEditBody(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              void updateActivity(it.id, { body: editBody.trim(), title: editTitle.trim() || undefined });
                            }}
                            className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                          >
                            Зберегти
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingId(null);
                            }}
                            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                          >
                            Скасувати
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={it.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => !isConfirmDelete && setExpandedId(isExpanded ? null : it.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!isConfirmDelete) setExpandedId(isExpanded ? null : it.id);
                      }
                    }}
                    className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm cursor-pointer hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-300 flex gap-3"
                  >
                    <div className={`flex shrink-0 items-center pt-0.5 ${iconColor}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-semibold text-zinc-900 flex flex-wrap items-center gap-2">
                          {displayTitle}
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-200">
                            {it.type}
                          </span>
                          {outcomeBadge && (
                            <span
                              className={
                                outcomeBadge.variant === "success"
                                  ? "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 border border-emerald-200"
                                  : outcomeBadge.variant === "plan"
                                    ? "rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 border border-zinc-300"
                                    : "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 border border-red-200"
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
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {canPin && (
                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                void updateActivity(it.id, {
                                  pinnedAt: isPinned ? null : new Date().toISOString(),
                                })
                              }
                              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                              title={isPinned ? "Відкріпити" : "Закріпити"}
                            >
                              {isPinned ? (
                                <PinOff className="h-4 w-4" />
                              ) : (
                                <Pin className="h-4 w-4" />
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => startEdit(it)}
                            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
                            title="Редагувати"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => setConfirmDeleteId(isConfirmDelete ? null : it.id)}
                            className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                            title="Видалити"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {hasBody && (
                        <div
                          className={`overflow-hidden transition-all duration-200 ease-out ${
                            isExpanded ? "mt-2 opacity-100" : "max-h-0 mt-0 opacity-0"
                          }`}
                        >
                          <div className="rounded bg-zinc-50 p-2 whitespace-pre-wrap text-sm text-zinc-700 border border-zinc-100">
                            {it.body}
                          </div>
                        </div>
                      )}
                      {isConfirmDelete && (
                        <div
                          className="mt-2 flex items-center gap-2 text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-zinc-600">Видалити?</span>
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => void deleteActivity(it.id)}
                            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
                          >
                            Так
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-50"
                          >
                            Ні
                          </button>
                        </div>
                      )}
                      {!isConfirmDelete && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{formatDateTime(it.occurredAt)}</span>
                          <span>·</span>
                          <span>by {it.createdByName ?? it.createdBy}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              };
              return (
                <div className="space-y-6">
                  {pinned.length > 0 && (
                    <section className="rounded-lg bg-amber-50/80 border border-amber-200/60 p-3 space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Закреплено
                      </h3>
                      <div className="space-y-3">
                        {pinned.map((it) => (
                          <div key={it.id} className="animate-timeline-card-in">
                            {renderItem(it)}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                  {sortedDateKeys.map((dateKey) => {
                    const label = dateGroupLabelFromYmd(dateKey);
                    return (
                      <section key={dateKey} className="space-y-3">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                          {label}
                        </h3>
                        <div className="space-y-3">
                          {byDateKey.get(dateKey)!.map((it) => (
                            <div key={it.id} className="animate-timeline-card-in">
                              {renderItem(it)}
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
