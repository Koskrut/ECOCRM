"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi, type TaskComment } from "@/lib/api/resources/tasks";
import { formatDateTime } from "@/lib/crmDatetime";
import { strings } from "@/locales";

const t = strings.tasks;

type Props = {
  taskId: string;
  initialCount?: number;
  onChanged?: () => void;
};

export function TaskCommentsSection({ taskId, initialCount = 0, onChanged }: Props) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await tasksApi.listComments(taskId);
      setComments(res.items);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!reply.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await tasksApi.addComment(taskId, reply.trim());
      setComments((prev) => [...prev, created]);
      setReply("");
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.actionFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-zinc-100 p-4">
      <p className="text-xs font-medium text-zinc-500">
        {t.comments.title}
        {comments.length > 0 || initialCount > 0 ? ` (${comments.length || initialCount})` : ""}
      </p>
      <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="text-xs text-zinc-400">{t.loading}</p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-zinc-400">{t.comments.empty}</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-700">{comment.author?.fullName ?? "—"}</span>
                <span className="text-[11px] text-zinc-400">{formatDateTime(comment.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{comment.body}</p>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 space-y-2">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder={t.comments.placeholder}
          className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
        />
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={saving || !reply.trim()}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {saving ? t.comments.sending : t.comments.send}
        </button>
      </div>
    </div>
  );
}
