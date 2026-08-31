"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi, ACTIVE_TASK_STATUSES, type Task } from "@/lib/api/resources/tasks";
import { formatDateTime } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { interpolate } from "@/lib/task-labels";
import { taskUrgencyBadgeClass } from "@/lib/task-urgency";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import type { TaskEntityType } from "@/components/tasks/TaskEntityLinker";
import { useConfirm } from "@/components/feedback";

const t = strings.tasks;
const PAGE_SIZE = 20;

type Props = {
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
  /** Called after list loads or changes (active/open task count). */
  onCountChange?: (total: number) => void;
  linkLabel?: string;
};

export function EntityTasksList({
  contactId,
  companyId,
  leadId,
  orderId,
  onCountChange,
  linkLabel,
}: Props) {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = items.find((row) => row.id === selectedTaskId) ?? null;

  const lockedType: TaskEntityType | undefined = contactId
    ? "contact"
    : companyId
      ? "company"
      : leadId
        ? "lead"
        : orderId
          ? "order"
          : undefined;

  const hasEntity = !!(contactId || companyId || leadId || orderId);

  const load = useCallback(async () => {
    if (!hasEntity) {
      setItems([]);
      setTotal(0);
      onCountChange?.(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const listQuery: Parameters<typeof tasksApi.list>[0] = {
        page,
        pageSize: PAGE_SIZE,
      };
      if (contactId) listQuery.contactId = contactId;
      if (companyId) listQuery.companyId = companyId;
      if (leadId) listQuery.leadId = leadId;
      if (orderId) listQuery.orderId = orderId;
      if (!showClosed) listQuery.status = ACTIVE_TASK_STATUSES;

      const activeQuery: Parameters<typeof tasksApi.list>[0] = {
        pageSize: 1,
        status: ACTIVE_TASK_STATUSES,
      };
      if (contactId) activeQuery.contactId = contactId;
      if (companyId) activeQuery.companyId = companyId;
      if (leadId) activeQuery.leadId = leadId;
      if (orderId) activeQuery.orderId = orderId;

      const [res, activeRes] = await Promise.all([
        tasksApi.list(listQuery),
        tasksApi.list(activeQuery),
      ]);
      setItems(res.items);
      setTotal(res.total);
      onCountChange?.(activeRes.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t.errors.loadFailed);
      setItems([]);
      setTotal(0);
      onCountChange?.(0);
    } finally {
      setLoading(false);
    }
  }, [hasEntity, contactId, companyId, leadId, orderId, showClosed, page, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [showClosed, contactId, companyId, leadId, orderId]);

  const complete = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : t.errors.completeFailed);
      }
    },
    [load],
  );

  const cancel = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: t.actions.confirmCancelTitle,
        message: t.actions.confirmCancelMessage,
        confirmText: t.actions.cancelTask,
        destructive: true,
      });
      if (!ok) return;
      try {
        await tasksApi.cancel(id);
        await load();
      } catch (e) {
        setErr(e instanceof Error ? e.message : t.errors.cancelFailed);
      }
    },
    [load, confirm],
  );

  if (!hasEntity) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-4 text-sm text-zinc-500">
        {t.saveEntityFirst}
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-700">
          {showClosed ? t.allTasks : t.activeTasks}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="text-sm text-zinc-600 underline hover:text-zinc-900"
          >
            {showClosed ? t.hideClosed : t.showClosed}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-accent-gradient px-3 py-1.5 text-sm font-medium text-white"
          >
            {t.actions.add}
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">{t.loading}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {showClosed ? t.empty.noTasks : t.empty.noActive}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((task) => (
            <li
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white p-3"
            >
              <button
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="font-medium text-zinc-900 hover:underline">{task.title}</p>
                {task.body ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-zinc-600">{task.body}</p>
                ) : null}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  <TaskStatusBadge status={task.status} />
                  <span className={`rounded px-1.5 py-0.5 ${taskUrgencyBadgeClass(task)}`}>
                    {t.dueLabel} {formatDateTime(task.dueAt ?? null)}
                  </span>
                  <span>
                    {t.assigneeLabel} {task.assignee?.fullName ?? "—"}
                  </span>
                </div>
              </button>
              {(task.status === "OPEN" || task.status === "IN_PROGRESS") && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void complete(task.id)}
                    className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                  >
                    {t.actions.complete}
                  </button>
                  <button
                    type="button"
                    onClick={() => void cancel(task.id)}
                    className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t.actions.cancel}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>{interpolate(t.showingCount, { shown: items.length, total })}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
            >
              {t.actions.previous}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
            >
              {t.actions.next}
            </button>
          </div>
        </div>
      ) : total > items.length ? (
        <p className="text-xs text-zinc-500">
          {interpolate(t.showingCount, { shown: items.length, total })}
        </p>
      ) : null}

      <TaskCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void load()}
        preset={{
          contactId,
          companyId,
          leadId,
          orderId,
          lockedType,
          linkLabel,
        }}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        initialTask={selectedTask}
        onClose={() => setSelectedTaskId(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
