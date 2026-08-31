"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirm } from "@/components/feedback";
import { scheduleModalClose } from "@/lib/modal/scheduleModalClose";
import {
  datetimeLocalKyivToIso,
  formatDateTime,
  isoToDatetimeLocalKyiv,
} from "@/lib/crmDatetime";
import { apiHttp } from "@/lib/api/client";
import { tasksApi, type Task, type TaskStatus } from "@/lib/api/resources/tasks";
import { strings } from "@/locales";
import { TaskActionsBar } from "./TaskActionsBar";
import { TaskCommentsSection } from "./TaskCommentsSection";
import {
  TaskEntityLinker,
  entityLinkToIds,
  taskToEntityLink,
  type TaskEntityLinkValue,
} from "./TaskEntityLinker";
import { TaskLinkedTo } from "./TaskLinkedTo";
import { TaskStatusBadge } from "./TaskStatusBadge";

const t = strings.tasks;

type UserOption = { id: string; fullName: string };

type Props = {
  taskId: string | null;
  /** Seed from list to avoid flicker while fetching. */
  initialTask?: Task | null;
  onClose: () => void;
  onChanged?: (task: Task) => void;
};

export function TaskDetailModal({ taskId, initialTask, onClose, onChanged }: Props) {
  const { confirm } = useConfirm();
  const [task, setTask] = useState<Task | null>(initialTask ?? null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);

  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("OPEN");
  const [editAssigneeId, setEditAssigneeId] = useState("");
  const [editCollaboratorIds, setEditCollaboratorIds] = useState<string[]>([]);
  const [editLink, setEditLink] = useState<TaskEntityLinkValue>(null);

  const syncEditFromTask = useCallback((row: Task) => {
    setEditTitle(row.title);
    setEditBody(row.body ?? "");
    setEditDueAt(isoToDatetimeLocalKyiv(row.dueAt));
    setEditStatus(row.status);
    setEditAssigneeId(row.assigneeId);
    setEditCollaboratorIds(row.collaborators?.map((c) => c.userId) ?? []);
    setEditLink(taskToEntityLink(row));
  }, []);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const row = await tasksApi.get(id);
      setTask(row);
      syncEditFromTask(row);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t.errors.loadOneFailed);
    } finally {
      setLoading(false);
    }
  }, [syncEditFromTask]);

  useEffect(() => {
    if (!taskId) return;
    setEditing(false);
    setError(null);
    if (initialTask && initialTask.id === taskId) {
      setTask(initialTask);
      syncEditFromTask(initialTask);
    }
    void load(taskId);
  }, [taskId, initialTask, load, syncEditFromTask]);

  useEffect(() => {
    if (!taskId) return;
    void (async () => {
      try {
        const usersRes = await apiHttp.get<{ items: UserOption[] }>("/users", {
          params: { scope: "assignees" },
        } as never);
        setUsers(usersRes.data?.items ?? []);
      } catch {
        setUsers([]);
      }
    })();
  }, [taskId]);

  const isDirty =
    editing &&
    task &&
    (editTitle !== task.title ||
      editBody !== (task.body ?? "") ||
      editDueAt !== isoToDatetimeLocalKyiv(task.dueAt) ||
      editStatus !== task.status ||
      editAssigneeId !== task.assigneeId ||
      JSON.stringify(editCollaboratorIds) !==
        JSON.stringify(task.collaborators?.map((c) => c.userId) ?? []) ||
      JSON.stringify(editLink) !== JSON.stringify(taskToEntityLink(task)));

  const requestClose = useCallback(async () => {
    if (saving || actionBusy) return;
    if (isDirty) {
      const ok = await confirm({
        title: t.actions.discardEditTitle,
        message: t.actions.discardEditMessage,
        confirmText: t.actions.cancelEdit,
        destructive: true,
      });
      if (!ok) return;
    }
    scheduleModalClose(onClose);
  }, [saving, actionBusy, isDirty, confirm, onClose]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [taskId, requestClose]);

  if (!taskId) return null;

  const applyTask = (next: Task) => {
    setTask(next);
    syncEditFromTask(next);
    onChanged?.(next);
  };

  const saveEdit = async () => {
    if (!task || !editTitle.trim()) {
      setError(t.errors.titleRequired);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const linkIds = entityLinkToIds(editLink);
      const updated = await tasksApi.update(task.id, {
        title: editTitle.trim(),
        body: editBody.trim() || null,
        dueAt: datetimeLocalKyivToIso(editDueAt),
        status: editStatus,
        assigneeId: editAssigneeId || null,
        collaboratorIds: editCollaboratorIds,
        contactId: linkIds.contactId ?? null,
        companyId: linkIds.companyId ?? null,
        leadId: linkIds.leadId ?? null,
        orderId: linkIds.orderId ?? null,
      });
      applyTask(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.errors.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => void requestClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl"
        role="dialog"
        aria-modal
        aria-labelledby="task-detail-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          {loading && !task ? (
            <p className="text-sm text-zinc-500">{t.loading}</p>
          ) : loadError && !task ? (
            <p className="text-sm text-red-600">{loadError}</p>
          ) : editing && task ? (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-zinc-600">{t.fields.title}</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
              <label className="block text-xs font-medium text-zinc-600">{t.fields.due}</label>
              <input
                type="datetime-local"
                value={editDueAt}
                onChange={(e) => setEditDueAt(e.target.value)}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
              <label className="block text-xs font-medium text-zinc-600">{t.columns.status}</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              >
                {(["OPEN", "IN_PROGRESS", "DONE", "CANCELED"] as TaskStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {strings.tasks.status[
                      s === "OPEN"
                        ? "open"
                        : s === "IN_PROGRESS"
                          ? "inProgress"
                          : s === "DONE"
                            ? "done"
                            : "canceled"
                    ]}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-medium text-zinc-600">{t.fields.assignee}</label>
              <select
                value={editAssigneeId}
                onChange={(e) => {
                  setEditAssigneeId(e.target.value);
                  setEditCollaboratorIds((prev) => prev.filter((id) => id !== e.target.value));
                }}
                className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              >
                {users.length === 0 && <option value="">{t.noUsers}</option>}
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-xs font-medium text-zinc-600">{t.collaborators.title}</label>
                <p className="mt-0.5 text-[11px] text-zinc-400">{t.collaborators.addHint}</p>
                <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded border border-zinc-200 p-2">
                  {users
                    .filter((u) => u.id !== editAssigneeId)
                    .map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={editCollaboratorIds.includes(u.id)}
                          onChange={(e) => {
                            setEditCollaboratorIds((prev) =>
                              e.target.checked
                                ? [...prev, u.id]
                                : prev.filter((id) => id !== u.id),
                            );
                          }}
                        />
                        {u.fullName}
                      </label>
                    ))}
                </div>
              </div>
              <TaskEntityLinker value={editLink} onChange={setEditLink} disabled={saving} />
            </div>
          ) : task ? (
            <>
              <h3 id="task-detail-title" className="text-lg font-semibold text-zinc-900">
                {task.title}
              </h3>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                <span>
                  {t.dueLabel} {formatDateTime(task.dueAt)}
                </span>
                <TaskStatusBadge status={task.status} />
              </p>
            </>
          ) : null}
        </div>

        {task ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-b border-zinc-100 p-4">
              <p className="text-xs font-medium text-zinc-500">{t.fields.description}</p>
              {editing ? (
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              ) : (
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-700">{task.body || "—"}</p>
              )}
            </div>

            {!editing ? (
              <div className="border-b border-zinc-100 p-4">
                <p className="text-xs font-medium text-zinc-500">{t.fields.assignee}</p>
                <p className="mt-0.5 text-sm text-zinc-700">{task.assignee?.fullName ?? "—"}</p>
                <p className="mt-2 text-xs font-medium text-zinc-500">{t.collaborators.title}</p>
                {task.collaborators && task.collaborators.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
                    {task.collaborators.map((row) => (
                      <li key={row.userId}>{row.user?.fullName ?? row.userId}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-sm text-zinc-400">{t.collaborators.empty}</p>
                )}
                <p className="mt-2 text-xs text-zinc-500">
                  {t.fields.createdBy}: {task.createdBy?.fullName ?? "—"}
                </p>
              </div>
            ) : null}

            <TaskCommentsSection
              taskId={task.id}
              initialCount={task._count?.comments ?? 0}
              onChanged={() => void load(task.id)}
            />

            {!editing ? (
              <div className="border-b border-zinc-100 p-4">
                <p className="text-xs font-medium text-zinc-500">{t.columns.linkedTo}</p>
                <div className="mt-0.5">
                  <TaskLinkedTo task={task} />
                </div>
              </div>
            ) : null}

            <div className="border-b border-zinc-100 p-4">
              <p className="text-xs font-medium text-zinc-500">{t.fields.dates}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
                <li>
                  {t.fields.created}: {formatDateTime(task.createdAt)}
                </li>
                <li>
                  {t.fields.updated}: {formatDateTime(task.updatedAt)}
                </li>
                {task.completedAt ? (
                  <li>
                    {t.fields.completed}: {formatDateTime(task.completedAt)}
                  </li>
                ) : null}
              </ul>
            </div>

            {!editing ? (
              <div className="border-b border-zinc-100 p-4">
                <TaskActionsBar
                  task={task}
                  busy={actionBusy}
                  onBusyChange={setActionBusy}
                  onChanged={applyTask}
                  onError={setError}
                />
              </div>
            ) : null}

            {error ? (
              <div className="border-b border-red-100 bg-red-50/50 px-4 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-zinc-200 px-5 py-4">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => void saveEdit()}
                disabled={saving || !editTitle.trim()}
                className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? t.actions.saving : t.actions.save}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (task) syncEditFromTask(task);
                  setEditing(false);
                  setError(null);
                }}
                disabled={saving}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {t.actions.cancelEdit}
              </button>
            </>
          ) : task ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t.actions.edit}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void requestClose()}
            className="ml-auto rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            {t.actions.close}
          </button>
        </div>
      </div>
    </div>
  );
}
