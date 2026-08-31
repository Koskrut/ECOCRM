"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTodo, Search } from "lucide-react";
import { EmptyState, ErrorPanel, useConfirm } from "@/components/feedback";
import { HelpHint } from "@/components/help/HelpHint";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { TaskLinkedTo } from "@/components/tasks/TaskLinkedTo";
import { TaskStatusBadge } from "@/components/tasks/TaskStatusBadge";
import {
  tasksApi,
  ACTIVE_TASK_STATUSES,
  resolveTaskListStatus,
  type Task,
  type TaskSortField,
  type TaskStatusFilter,
} from "@/lib/api/resources/tasks";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import {
  formatDateTime,
  kyivTodayIsoBoundsUtcIsoStrings,
  kyivWeekIsoBoundsUtcIsoStrings,
} from "@/lib/crmDatetime";
import {
  groupTasksByUrgency,
  taskUrgencyBadgeClass,
  taskUrgencyLabel,
  taskUrgencyRowClass,
} from "@/lib/task-urgency";
import { authApi } from "@/lib/api/resources/auth";
import { strings } from "@/locales";
import {
  interpolate,
  taskStatusFilterLabel,
} from "@/lib/task-labels";
import {
  buildTasksSearchParams,
  parseTasksUrl,
  type TaskView,
  type TasksUrlState,
} from "./tasks-url";

const t = strings.tasks;
const PAGE_SIZE = 20;

function getTaskStatusOptions(): { value: TaskStatusFilter; label: string }[] {
  return (["active", "OPEN", "IN_PROGRESS", "DONE", "CANCELED", "all"] as TaskStatusFilter[]).map(
    (value) => ({ value, label: taskStatusFilterLabel(value) }),
  );
}

function getPeriodOptions(): { value: "" | "week" | "overdue"; label: string }[] {
  return [
    { value: "", label: t.period.allTime },
    { value: "week", label: t.period.thisWeek },
    { value: "overdue", label: t.period.overdue },
  ];
}

function getViewOptions(): { value: TaskView; label: string }[] {
  return (["mine", "delegated", "all", "overdue", "today"] as TaskView[]).map((value) => ({
    value,
    label: t.views[value],
  }));
}

function getSortOptions(): { sortBy: TaskSortField; sortDir: "asc" | "desc"; label: string }[] {
  return [
    { sortBy: "priority", sortDir: "asc", label: t.sort.priority },
    { sortBy: "dueAt", sortDir: "asc", label: t.sort.dueAsc },
    { sortBy: "dueAt", sortDir: "desc", label: t.sort.dueDesc },
    { sortBy: "createdAt", sortDir: "desc", label: t.sort.createdDesc },
    { sortBy: "createdAt", sortDir: "asc", label: t.sort.createdAsc },
    { sortBy: "updatedAt", sortDir: "desc", label: t.sort.updatedDesc },
  ];
}

function getPeriodBounds(period: "" | "week" | "overdue"): {
  dueFrom?: string;
  dueTo?: string;
  status?: Task["status"][];
} {
  if (period === "week") {
    const { from, to } = kyivWeekIsoBoundsUtcIsoStrings();
    return { dueFrom: from, dueTo: to };
  }
  if (period === "overdue") {
    return { status: ["OPEN", "IN_PROGRESS"], dueTo: kyivTodayIsoBoundsUtcIsoStrings().from };
  }
  return {};
}

function buildListQuery(args: {
  view: TaskView;
  myUserId: string | null;
  statusFilter: TaskStatusFilter;
  periodFilter: "" | "week" | "overdue";
  attention: "" | "overdue";
  taskIdsFilter: string;
  assigneeFilter: string;
  q: string;
  sortBy: TaskSortField;
  sortDir: "asc" | "desc";
  page: number;
  pageSize: number;
}): Parameters<typeof tasksApi.list>[0] {
  const {
    view,
    myUserId,
    statusFilter,
    periodFilter,
    attention,
    taskIdsFilter,
    assigneeFilter,
    q,
    sortBy,
    sortDir,
    page,
    pageSize,
  } = args;

  const query: Parameters<typeof tasksApi.list>[0] = {
    q: q.trim() || undefined,
    sortBy,
    sortDir,
    page,
    pageSize,
  };

  if (taskIdsFilter) {
    query.ids = taskIdsFilter;
    return query;
  }

  if (view === "overdue" || attention === "overdue") {
    query.attention = "overdue";
    return query;
  }

  if (view === "today") {
    const { from, to } = kyivTodayIsoBoundsUtcIsoStrings();
    query.dueFrom = from;
    query.dueTo = to;
    query.status = ACTIVE_TASK_STATUSES;
    return query;
  }

  if (view === "mine" && myUserId) {
    query.assigneeId = myUserId;
    query.status = resolveTaskListStatus(statusFilter);
    return query;
  }

  if (view === "delegated") {
    query.delegated = true;
    query.status = resolveTaskListStatus(statusFilter);
    return query;
  }

  const period =
    periodFilter === "overdue"
      ? getPeriodBounds("overdue")
      : periodFilter === "week"
        ? getPeriodBounds("week")
        : {};
  query.status = resolveTaskListStatus(statusFilter, period.status);
  query.dueFrom = period.dueFrom;
  query.dueTo = period.dueTo;
  if (assigneeFilter) query.assigneeId = assigneeFilter;
  return query;
}

function TaskTableRow({
  task,
  onSelect,
  onComplete,
  onCancel,
}: {
  task: Task;
  onSelect: () => void;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const commentCount = task._count?.comments ?? 0;
  const extraAssignees = task.collaborators?.length ?? 0;
  const isActive = task.status === "OPEN" || task.status === "IN_PROGRESS";

  return (
    <tr
      className={`cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/80 ${taskUrgencyRowClass(task)}`}
      onClick={onSelect}
    >
      <td className="max-w-xs px-4 py-3">
        <p className="line-clamp-2 font-medium text-zinc-900">{task.title}</p>
        {(task.body?.trim() || commentCount > 0) && (
          <div className="mt-1 flex flex-wrap gap-1">
            {task.body?.trim() ? (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                {t.tableMeta.hasDescription}
              </span>
            ) : null}
            {commentCount > 0 ? (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                {commentCount} {t.tableMeta.replies}
              </span>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded px-1.5 py-0.5 text-xs ${taskUrgencyBadgeClass(task)}`}>
          {formatDateTime(task.dueAt)}
        </span>
      </td>
      <td className="px-4 py-3">
        <TaskStatusBadge status={task.status} />
      </td>
      <td className="px-4 py-3 text-zinc-600">
        <p>{task.assignee?.fullName ?? "—"}</p>
        {extraAssignees > 0 ? (
          <p className="mt-0.5 text-xs text-zinc-400">
            +{extraAssignees} {t.collaborators.title.toLowerCase()}
          </p>
        ) : null}
        {task.createdBy && task.createdBy.id !== task.assigneeId ? (
          <p className="mt-0.5 text-xs text-zinc-400">
            {t.fields.createdBy}: {task.createdBy.fullName}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <TaskLinkedTo task={task} />
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">{formatDateTime(task.createdAt)}</td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {isActive ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={onComplete}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            >
              {t.actions.complete}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {t.actions.cancel}
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function TaskCard({ task, onSelect }: { task: Task; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm ${taskUrgencyRowClass(task)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 font-medium text-zinc-900">{task.title}</p>
        <TaskStatusBadge status={task.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className={`rounded px-1.5 py-0.5 ${taskUrgencyBadgeClass(task)}`}>
          {formatDateTime(task.dueAt)}
        </span>
        <span>{task.assignee?.fullName ?? "—"}</span>
      </div>
    </button>
  );
}

type UserOption = { id: string; fullName: string };

export default function TasksPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-zinc-500">{t.loading}</div>}>
      <TasksPageContent />
    </Suspense>
  );
}

function TasksPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { confirm } = useConfirm();
  const initial = useMemo(() => parseTasksUrl(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  const taskStatusOptions = useMemo(() => getTaskStatusOptions(), []);
  const viewOptions = useMemo(() => getViewOptions(), []);
  const periodOptions = useMemo(() => getPeriodOptions(), []);
  const sortOptions = useMemo(() => getSortOptions(), []);

  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<TaskView>(initial.view);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>(initial.status);
  const [periodFilter, setPeriodFilter] = useState<"" | "week" | "overdue">(initial.period);
  const [attention, setAttention] = useState<"" | "overdue">(initial.attention);
  const [taskIdsFilter, setTaskIdsFilter] = useState(initial.ids);
  const [assigneeFilter, setAssigneeFilter] = useState(initial.assigneeId);
  const [q, setQ] = useState(initial.q);
  const [qInput, setQInput] = useState(initial.q);
  const [sortBy, setSortBy] = useState<TaskSortField>(initial.sortBy);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initial.sortDir);
  const [page, setPage] = useState(initial.page);

  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initial.taskId || null);
  const selectedTask = items.find((row) => row.id === selectedTaskId) ?? null;
  const [actionError, setActionError] = useState<string | null>(null);

  const urlState: TasksUrlState = useMemo(
    () => ({
      view,
      attention,
      period: periodFilter,
      status: statusFilter,
      assigneeId: assigneeFilter,
      q,
      sortBy,
      sortDir,
      page,
      taskId: selectedTaskId ?? "",
      ids: taskIdsFilter,
    }),
    [
      view,
      attention,
      periodFilter,
      statusFilter,
      assigneeFilter,
      q,
      sortBy,
      sortDir,
      page,
      selectedTaskId,
      taskIdsFilter,
    ],
  );

  useEffect(() => {
    const next = buildTasksSearchParams(urlState).toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [urlState, pathname, router, searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        const [usersRes, meRes] = await Promise.all([
          apiHttp.get<{ items: UserOption[] }>("/users", { params: { scope: "assignees" } } as never),
          authApi.me(),
        ]);
        setUsers(usersRes.data?.items ?? []);
        setMyUserId(meRes.user?.id ?? null);
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const nextQ = qInput.trim();
      setPage(1);
      setQ((prev) => (prev === nextQ ? prev : nextQ));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await tasksApi.list(
        buildListQuery({
          view,
          myUserId,
          statusFilter,
          periodFilter,
          attention,
          taskIdsFilter,
          assigneeFilter,
          q,
          sortBy,
          sortDir,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setLoadError(e instanceof Error ? e.message : t.errors.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [
    assigneeFilter,
    attention,
    myUserId,
    q,
    statusFilter,
    periodFilter,
    sortBy,
    sortDir,
    page,
    taskIdsFilter,
    view,
  ]);

  useEffect(() => {
    if (view === "mine" && !myUserId) return;
    void load();
  }, [load, view, myUserId]);

  const openTask = useCallback((id: string) => {
    setSelectedTaskId(id);
  }, []);

  const closeTask = useCallback(() => {
    setSelectedTaskId(null);
  }, []);

  const completeTask = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await tasksApi.complete(id);
        setSelectedTaskId((prev) => (prev === id ? null : prev));
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t.errors.completeFailed);
      }
    },
    [load],
  );

  const cancelTask = useCallback(
    async (id: string) => {
      const ok = await confirm({
        title: t.actions.confirmCancelTitle,
        message: t.actions.confirmCancelMessage,
        confirmText: t.actions.cancelTask,
        destructive: true,
      });
      if (!ok) return;
      setActionError(null);
      try {
        await tasksApi.cancel(id);
        setSelectedTaskId((prev) => (prev === id ? null : prev));
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t.errors.cancelFailed);
      }
    },
    [confirm, load],
  );

  const onTaskChanged = useCallback(
    (task: Task) => {
      setItems((prev) => {
        const idx = prev.findIndex((row) => row.id === task.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = task;
        return next;
      });
      const hidden =
        statusFilter === "active"
          ? task.status !== "OPEN" && task.status !== "IN_PROGRESS"
          : statusFilter !== "all" && statusFilter !== task.status;
      if (hidden) {
        setSelectedTaskId((prev) => (prev === task.id ? null : prev));
        void load();
      }
    },
    [statusFilter, load],
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const groupedItems = useMemo(
    () => (sortBy === "priority" ? groupTasksByUrgency(items) : null),
    [items, sortBy],
  );

  const resetFilters = () => {
    setView("mine");
    setStatusFilter("active");
    setPeriodFilter("");
    setAttention("");
    setTaskIdsFilter("");
    setAssigneeFilter("");
    setSortBy("priority");
    setSortDir("asc");
    setQInput("");
    setQ("");
    setPage(1);
  };

  const filtersActive =
    view !== "mine" ||
    statusFilter !== "active" ||
    periodFilter !== "" ||
    attention !== "" ||
    taskIdsFilter !== "" ||
    assigneeFilter !== "" ||
    sortBy !== "priority" ||
    sortDir !== "asc" ||
    q.trim() !== "";

  const emptyTitle =
    view === "mine" && !filtersActive ? t.empty.myQueue : filtersActive ? t.empty.noMatch : t.empty.noTasks;
  const emptyHint =
    view === "mine" && !filtersActive
      ? t.empty.myQueueHint
      : filtersActive
        ? t.empty.noMatchHint
        : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
            <ListTodo className="h-7 w-7 text-zinc-600" />
            {t.pageTitle}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">{t.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpHint routeKey="tasks" />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white"
          >
            {t.addTask}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {viewOptions.map((option) => {
            const active = view === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setView(option.value);
                  setPage(1);
                  if (option.value === "overdue") {
                    setAttention("overdue");
                    setPeriodFilter("overdue");
                  } else {
                    setAttention("");
                    if (periodFilter === "overdue") setPeriodFilter("");
                  }
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {option.label}
                {active && total > 0 ? ` (${total})` : ""}
              </button>
            );
          })}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setQ(qInput.trim());
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
        >
          <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            type="search"
            aria-label={t.searchAriaLabel}
          />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodFilter}
            onChange={(e) => {
              const next = e.target.value as "" | "week" | "overdue";
              setPeriodFilter(next);
              setAttention(next === "overdue" ? "overdue" : "");
              if (next === "overdue") setView("overdue");
              else if (view === "overdue") setView("all");
              setTaskIdsFilter("");
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
            disabled={view === "mine" || view === "delegated" || view === "today" || view === "overdue"}
          >
            {periodOptions.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TaskStatusFilter);
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
            disabled={view === "overdue" || view === "today"}
          >
            {taskStatusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => {
              setAssigneeFilter(e.target.value);
              if (e.target.value) setView("all");
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
            disabled={view === "mine" || view === "delegated"}
          >
            <option value="">{t.allAssignees}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </select>
          <select
            value={`${sortBy}-${sortDir}`}
            onChange={(e) => {
              const [by, dir] = (e.target.value as string).split("-") as [TaskSortField, "asc" | "desc"];
              if (by && dir) {
                setSortBy(by);
                setSortDir(dir);
                setPage(1);
              }
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            {sortOptions.map((o) => (
              <option key={`${o.sortBy}-${o.sortDir}`} value={`${o.sortBy}-${o.sortDir}`}>
                {o.label}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              {t.actions.resetFilters}
            </button>
          )}
        </div>
        {(attention || taskIdsFilter) && (
          <div className="flex flex-wrap items-center gap-2">
            {attention ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                {t.attentionBadge.overdue}
              </span>
            ) : null}
            {taskIdsFilter ? (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900">
                {interpolate(t.attentionBadge.dayPlan, {
                  count: taskIdsFilter.split(",").filter(Boolean).length,
                })}
              </span>
            ) : null}
          </div>
        )}
        <p className="text-sm text-zinc-500">
          {interpolate(t.total, { total })}
          {totalPages > 1 ? interpolate(t.pageOf, { page, totalPages }) : ""}
        </p>
      </div>

      {loadError ? (
        <ErrorPanel message={loadError} onRetry={() => void load()} />
      ) : loading ? (
        <p className="text-sm text-zinc-500">{t.loading}</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title={emptyTitle}
          description={emptyHint}
          action={
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white"
            >
              {t.actions.create}
            </button>
          }
        />
      ) : (
        <>
          {actionError ? (
            <ErrorPanel variant="inline" message={actionError} />
          ) : null}
          <div className="hidden overflow-x-auto rounded-xl border border-zinc-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80">
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.title}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.due}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.status}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.assignee}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.linkedTo}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.created}</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">{t.columns.actions}</th>
                </tr>
              </thead>
              <tbody>
                {groupedItems
                  ? groupedItems.flatMap(({ bucket, tasks: groupTasks }) => [
                      <tr key={`group-${bucket}`} className="bg-zinc-50/90">
                        <td
                          colSpan={7}
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600"
                        >
                          {taskUrgencyLabel(bucket)} ({groupTasks.length})
                        </td>
                      </tr>,
                      ...groupTasks.map((task) => (
                        <TaskTableRow
                          key={task.id}
                          task={task}
                          onSelect={() => {
                            if (isTextSelected()) return;
                            openTask(task.id);
                          }}
                          onComplete={() => void completeTask(task.id)}
                          onCancel={() => void cancelTask(task.id)}
                        />
                      )),
                    ])
                  : items.map((task) => (
                      <TaskTableRow
                        key={task.id}
                        task={task}
                        onSelect={() => {
                          if (isTextSelected()) return;
                          openTask(task.id);
                        }}
                        onComplete={() => void completeTask(task.id)}
                        onCancel={() => void cancelTask(task.id)}
                      />
                    ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 md:hidden">
            {(groupedItems ? groupedItems.flatMap((g) => g.tasks) : items).map((task) => (
              <TaskCard key={task.id} task={task} onSelect={() => openTask(task.id)} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>{interpolate(t.pagination, { page, totalPages, total })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
                >
                  {t.actions.previous}
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
                >
                  {t.actions.next}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <TaskCreateModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => {
          void load();
        }}
      />

      <TaskDetailModal
        taskId={selectedTaskId}
        initialTask={selectedTask}
        onClose={closeTask}
        onChanged={onTaskChanged}
      />
    </div>
  );
}
