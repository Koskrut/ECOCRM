"use client";

import { useState } from "react";
import { useConfirm } from "@/components/feedback";
import { tasksApi, type Task, type TaskStatus } from "@/lib/api/resources/tasks";
import { strings } from "@/locales";
import { TaskRescheduleChips } from "./TaskRescheduleChips";

const t = strings.tasks;

type Props = {
  task: Task;
  busy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onChanged: (task: Task) => void;
  onError?: (message: string) => void;
  showReschedule?: boolean;
  className?: string;
};

export function TaskActionsBar({
  task,
  busy,
  onBusyChange,
  onChanged,
  onError,
  showReschedule = true,
  className,
}: Props) {
  const { confirm } = useConfirm();
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy ?? localBusy;

  const setBusy = (v: boolean) => {
    setLocalBusy(v);
    onBusyChange?.(v);
  };

  const run = async (fn: () => Promise<Task>, failMsg: string) => {
    setBusy(true);
    try {
      const next = await fn();
      onChanged(next);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : failMsg);
    } finally {
      setBusy(false);
    }
  };

  const isActive = task.status === "OPEN" || task.status === "IN_PROGRESS";
  if (!isActive) return null;

  return (
    <div className={className}>
      {showReschedule ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-zinc-500">{t.fields.due}</p>
          <TaskRescheduleChips
            disabled={isBusy}
            onReschedule={(dueAt) =>
              void run(() => tasksApi.update(task.id, { dueAt }), t.errors.rescheduleFailed)
            }
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {task.status === "OPEN" ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() =>
              void run(
                () => tasksApi.update(task.id, { status: "IN_PROGRESS" as TaskStatus }),
                t.errors.startFailed,
              )
            }
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            {t.actions.startWork}
          </button>
        ) : null}
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void run(() => tasksApi.complete(task.id), t.errors.completeFailed)}
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
        >
          {t.actions.complete}
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void (async () => {
              const ok = await confirm({
                title: t.actions.confirmCancelTitle,
                message: t.actions.confirmCancelMessage,
                confirmText: t.actions.cancelTask,
                destructive: true,
              });
              if (!ok) return;
              await run(() => tasksApi.cancel(task.id), t.errors.cancelFailed);
            })();
          }}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t.actions.cancelTask}
        </button>
      </div>
    </div>
  );
}
