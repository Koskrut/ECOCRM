"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi, type Task, type TaskStatus } from "@/lib/api/resources/tasks";

type Props = {
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
};

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELED: "Canceled",
};

function formatDueAt(dueAt: string | null | undefined): string {
  if (!dueAt) return "—";
  const d = new Date(dueAt);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: d.getHours() || d.getMinutes() ? "2-digit" : undefined,
    minute: d.getHours() || d.getMinutes() ? "2-digit" : undefined,
  });
}

export function EntityTasksList({
  contactId,
  companyId,
  leadId,
  orderId,
}: Props) {
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newBody, setNewBody] = useState("");
  const [saving, setSaving] = useState(false);

  const query = useCallback(() => {
    const q: Parameters<typeof tasksApi.list>[0] = { pageSize: 50 };
    if (contactId) q.contactId = contactId;
    if (companyId) q.companyId = companyId;
    if (leadId) q.leadId = leadId;
    if (orderId) q.orderId = orderId;
    return q;
  }, [contactId, companyId, leadId, orderId]);

  const hasEntity = !!(contactId || companyId || leadId || orderId);

  const load = useCallback(async () => {
    if (!hasEntity) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await tasksApi.list(query());
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load tasks");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [hasEntity, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTask = useCallback(async () => {
    if (!newTitle.trim() || !hasEntity) return;
    setSaving(true);
    setErr(null);
    try {
      await tasksApi.create({
        title: newTitle.trim(),
        body: newBody.trim() || undefined,
        dueAt: newDueAt.trim() || undefined,
        contactId: contactId ?? undefined,
        companyId: companyId ?? undefined,
        leadId: leadId ?? undefined,
        orderId: orderId ?? undefined,
      });
      setNewTitle("");
      setNewDueAt("");
      setNewBody("");
      await load();
    } catch (e) {
      setErr(
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to add task"),
      );
    } finally {
      setSaving(false);
    }
  }, [newTitle, newBody, newDueAt, hasEntity, contactId, companyId, leadId, orderId, load]);

  const complete = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to complete task");
      }
    },
    [load],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await tasksApi.cancel(id);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to cancel task");
      }
    },
    [load],
  );

  if (!hasEntity) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500">
        Save the entity first to manage tasks.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-zinc-200 bg-zinc-50/30 p-3">
        <p className="mb-2 text-sm font-medium text-zinc-700">Add task</p>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Task title"
            className="rounded border border-zinc-200 px-2 py-1.5 text-sm"
          />
          <input
            type="datetime-local"
            value={newDueAt}
            onChange={(e) => setNewDueAt(e.target.value)}
            className="rounded border border-zinc-200 px-2 py-1.5 text-sm"
          />
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Note (optional)"
            rows={2}
            className="rounded border border-zinc-200 px-2 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => void addTask()}
            disabled={saving || !newTitle.trim()}
            className="self-start rounded-md bg-accent-gradient px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading tasks…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">No tasks yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-zinc-900">{task.title}</p>
                {task.body && (
                  <p className="mt-0.5 text-sm text-zinc-600">{task.body}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <span
                    className={`rounded px-1.5 py-0.5 ${
                      task.status === "DONE"
                        ? "bg-emerald-100 text-emerald-800"
                        : task.status === "CANCELED"
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-blue-100 text-blue-800"
                    }`}
                  >
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                  <span>Due: {formatDueAt(task.dueAt ?? null)}</span>
                </div>
              </div>
              {(task.status === "OPEN" || task.status === "IN_PROGRESS") && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void complete(task.id)}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    Complete
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancel(task.id)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {total > items.length && (
        <p className="text-xs text-zinc-500">
          Showing {items.length} of {total} tasks.
        </p>
      )}
    </div>
  );
}
