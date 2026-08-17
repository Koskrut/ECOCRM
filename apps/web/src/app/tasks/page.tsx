"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListTodo, Search } from "lucide-react";
import { TaskCommentsSection } from "@/components/tasks/TaskCommentsSection";
import { HelpHint } from "@/components/help/HelpHint";
import {
  tasksApi,
  ACTIVE_TASK_STATUSES,
  resolveTaskListStatus,
  type Task,
  type TaskStatus,
  type TaskSortField,
  type TaskStatusFilter,
} from "@/lib/api/resources/tasks";
import { apiHttp } from "@/lib/api/client";
import { isTextSelected } from "@/lib/dom";
import { formatPhoneDisplay } from "@/lib/formatPhone";
import { formatDateTime, kyivTodayIsoBoundsUtcIsoStrings, kyivWeekIsoBoundsUtcIsoStrings } from "@/lib/crmDatetime";
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
  taskLinkedTypeLabel,
  taskStatusFilterLabel,
  taskStatusLabel,
} from "@/lib/task-labels";

const t = strings.tasks;

const ATTENTION_LABELS: Record<"overdue", string> = {
  overdue: "Прострочені завдання",
};

function getTaskStatusOptions(): { value: TaskStatusFilter; label: string }[] {
  return (
    ["active", "OPEN", "IN_PROGRESS", "DONE", "CANCELED", "all"] as TaskStatusFilter[]
  ).map((value) => ({ value, label: taskStatusFilterLabel(value) }));
}

function getPeriodOptions(): { value: "" | "week" | "overdue"; label: string }[] {
  return [
    { value: "", label: t.period.allTime },
    { value: "week", label: t.period.thisWeek },
    { value: "overdue", label: t.period.overdue },
  ];
}

type TaskView = "mine" | "delegated" | "all" | "overdue" | "today";

function getViewOptions(): { value: TaskView; label: string }[] {
  return (
    ["mine", "delegated", "all", "overdue", "today"] as TaskView[]
  ).map((value) => ({ value, label: t.views[value] }));
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

function formatDueAt(dueAt: string | null | undefined): string {
  return formatDateTime(dueAt);
}

function formatTaskDateCell(dateStr: string | null | undefined): string {
  return formatDateTime(dateStr);
}

function getPeriodBounds(period: "" | "week" | "overdue"): { dueFrom?: string; dueTo?: string; status?: TaskStatus[] } {
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

function TaskLinkedTo({ task }: { task: Task }) {
  const links: { href: string; label: string }[] = [];
  if (task.contactId) {
    const contactName = [task.contact?.lastName, task.contact?.firstName].filter(Boolean).join(" ").trim();
    links.push({
      href: `/contacts?contactId=${task.contactId}`,
      label: contactName
        ? interpolate(t.linkedTo.contactWithName, { name: contactName })
        : t.linkedTo.contact,
    });
  }
  if (task.companyId) {
    links.push({
      href: `/companies?companyId=${task.companyId}`,
      label: task.company?.name
        ? interpolate(t.linkedTo.companyWithName, { name: task.company.name })
        : t.linkedTo.company,
    });
  }
  if (task.leadId) {
    links.push({
      href: `/leads?leadId=${task.leadId}`,
      label: task.lead?.fullName
        ? interpolate(t.linkedTo.leadWithName, { name: task.lead.fullName })
        : t.linkedTo.lead,
    });
  }
  if (task.orderId) {
    links.push({
      href: `/orders?orderId=${task.orderId}`,
      label: task.order?.orderNumber
        ? interpolate(t.linkedTo.orderWithName, { name: task.order.orderNumber })
        : t.linkedTo.order,
    });
  }
  if (links.length === 0) return <span className="text-zinc-500">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {links.map((l) => (
        <Link key={l.href} href={l.href} className="text-zinc-700 underline hover:text-zinc-900" onClick={(e) => e.stopPropagation()}>
          {l.label}
        </Link>
      ))}
    </span>
  );
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
          {formatDueAt(task.dueAt)}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`rounded px-1.5 py-0.5 text-xs ${
            task.status === "DONE"
              ? "bg-emerald-100 text-emerald-800"
              : task.status === "CANCELED"
                ? "bg-zinc-100 text-zinc-600"
                : "bg-blue-100 text-blue-800"
          }`}
        >
          {taskStatusLabel(task.status)}
        </span>
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
      <td className="px-4 py-3 text-xs text-zinc-500">{formatTaskDateCell(task.createdAt)}</td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        {(task.status === "OPEN" || task.status === "IN_PROGRESS") && (
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
        )}
      </td>
    </tr>
  );
}

type EntityType = "contact" | "company" | "lead" | "order";

type SearchOption = { id: string; label: string };
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
  const taskStatusOptions = useMemo(() => getTaskStatusOptions(), []);
  const viewOptions = useMemo(() => getViewOptions(), []);
  const periodOptions = useMemo(() => getPeriodOptions(), []);
  const sortOptions = useMemo(() => getSortOptions(), []);
  const editStatusOptions = useMemo(
    () => taskStatusOptions.filter((o) => o.value !== "active" && o.value !== "all"),
    [taskStatusOptions],
  );

  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TaskView>(() => {
    if (searchParams.get("attention") === "overdue" || searchParams.get("period") === "overdue") return "overdue";
    return "mine";
  });
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("active");
  const [periodFilter, setPeriodFilter] = useState<"" | "week" | "overdue">(() => {
    const raw = searchParams.get("period");
    if (raw === "week") return "week";
    if (raw === "overdue" || searchParams.get("attention") === "overdue") return "overdue";
    return "";
  });
  const [attention, setAttention] = useState<"" | "overdue">(() => {
    if (searchParams.get("attention") === "overdue") return "overdue";
    if (searchParams.get("period") === "overdue") return "overdue";
    return "";
  });
  const [taskIdsFilter, setTaskIdsFilter] = useState(() => searchParams.get("ids") ?? "");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [sortBy, setSortBy] = useState<TaskSortField>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDueAt, setNewDueAt] = useState("");
  const [newBody, setNewBody] = useState("");
  const [linkType, setLinkType] = useState<EntityType>("contact");
  const [linkSearch, setLinkSearch] = useState("");
  const [linkOptions, setLinkOptions] = useState<SearchOption[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState<string>("");

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = items.find((t) => t.id === selectedTaskId) ?? null;
  const [cardEditing, setCardEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("OPEN");
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [editAssigneeId, setEditAssigneeId] = useState<string>("");
  const [editCollaboratorIds, setEditCollaboratorIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTask) {
      setEditTitle(selectedTask.title);
      setEditBody(selectedTask.body ?? "");
      setEditDueAt(selectedTask.dueAt ? new Date(selectedTask.dueAt).toISOString().slice(0, 16) : "");
      setEditStatus(selectedTask.status);
      setEditAssigneeId(selectedTask.assigneeId);
      setEditCollaboratorIds(selectedTask.collaborators?.map((row) => row.userId) ?? []);
      setCardEditing(false);
      setCardError(null);
    }
  }, [selectedTask?.id]);

  useEffect(() => {
    void (async () => {
      try {
        const [usersRes, meRes] = await Promise.all([
          apiHttp.get<{ items: UserOption[] }>("/users", { params: { scope: "assignees" } } as never),
          authApi.me(),
        ]);
        setUsers(usersRes.data?.items ?? []);
        setMyUserId(meRes.user?.id ?? null);
        setNewAssigneeId(meRes.user?.id ?? "");
      } catch {
        setUsers([]);
      }
    })();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (attention) params.set("attention", attention);
    else if (periodFilter === "overdue") params.set("period", "overdue");
    else if (periodFilter === "week") params.set("period", "week");
    if (taskIdsFilter) params.set("ids", taskIdsFilter);
    if (q) params.set("q", q);
    const taskId = searchParams.get("taskId");
    if (taskId) params.set("taskId", taskId);

    const next = params.toString();
    const current = searchParams.toString();
    if (next !== current) {
      router.replace(`${pathname}${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [attention, page, pathname, periodFilter, q, router, searchParams, taskIdsFilter]);

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
          pageSize,
        }),
      );
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [assigneeFilter, attention, myUserId, q, statusFilter, periodFilter, sortBy, sortDir, page, taskIdsFilter, view]);

  useEffect(() => {
    if (view === "mine" && !myUserId) return;
    void load();
  }, [load, view, myUserId]);

  useEffect(() => {
    const taskId = searchParams.get("taskId");
    if (!taskId) return;
    setSelectedTaskId(taskId);
    void tasksApi
      .get(taskId)
      .then((task) => {
        setItems((prev) => (prev.some((row) => row.id === taskId) ? prev : [task, ...prev]));
      })
      .catch(() => {
        // task may be inaccessible or deleted
      });
  }, [searchParams]);

  const searchEntities = useCallback(async () => {
    if (!linkSearch.trim()) {
      setLinkOptions([]);
      return;
    }
    setLinkSearching(true);
    try {
      if (linkType === "contact") {
        const r = await apiHttp.get<{ items: { id: string; firstName: string; lastName: string; phone: string }[] }>(
          "/contacts",
          { params: { q: linkSearch, page: 1, pageSize: 20 } } as never,
        );
        const list = r.data?.items ?? [];
        setLinkOptions(list.map((c) => ({ id: c.id, label: `${c.lastName} ${c.firstName} — ${formatPhoneDisplay(c.phone)}` })));
      } else if (linkType === "company") {
        const r = await apiHttp.get<{ items: { id: string; name: string }[] }>("/companies", {
          params: { search: linkSearch, page: 1, pageSize: 20 } } as never,
        );
        const list = r.data?.items ?? [];
        setLinkOptions(list.map((c) => ({ id: c.id, label: c.name })));
      } else if (linkType === "lead") {
        const r = await apiHttp.get<{ items: { id: string; fullName: string | null; phone: string | null; companyName: string | null }[] }>(
          "/leads",
          { params: { q: linkSearch, page: 1, pageSize: 20 } } as never,
        );
        const list = r.data?.items ?? [];
        setLinkOptions(list.map((l) => ({ id: l.id, label: [l.fullName, l.phone ? formatPhoneDisplay(l.phone) : null, l.companyName].filter(Boolean).join(" — ") || l.id })));
      } else {
        const r = await apiHttp.get<{ items: { id: string; orderNumber: string }[] }>(
          "/orders",
          { params: { q: linkSearch.trim() || undefined, page: 1, pageSize: 20 } } as never,
        );
        const list = r.data?.items ?? [];
        setLinkOptions(list.map((o) => ({ id: o.id, label: o.orderNumber })));
      }
    } catch {
      setLinkOptions([]);
    } finally {
      setLinkSearching(false);
    }
  }, [linkType, linkSearch]);

  useEffect(() => {
    const t = setTimeout(searchEntities, 300);
    return () => clearTimeout(t);
  }, [linkSearch, linkType, searchEntities]);

  const submitAdd = useCallback(async () => {
    if (!newTitle.trim()) {
      setAddError(t.errors.titleRequired);
      return;
    }
    const body: Parameters<typeof tasksApi.create>[0] = {
      title: newTitle.trim(),
      body: newBody.trim() || undefined,
      dueAt: newDueAt.trim() || undefined,
      assigneeId: newAssigneeId || undefined,
    };
    if (selectedLinkId) {
      if (linkType === "contact") body.contactId = selectedLinkId;
      else if (linkType === "company") body.companyId = selectedLinkId;
      else if (linkType === "lead") body.leadId = selectedLinkId;
      else body.orderId = selectedLinkId;
    }
    setSaving(true);
    setAddError(null);
    try {
      await tasksApi.create(body);
      setNewTitle("");
      setNewDueAt("");
      setNewBody("");
      setSelectedLinkId(null);
      setLinkSearch("");
      setLinkOptions([]);
      setShowAdd(false);
      if (myUserId) setNewAssigneeId(myUserId);
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t.errors.createFailed);
    } finally {
      setSaving(false);
    }
  }, [newTitle, newBody, newDueAt, newAssigneeId, linkType, selectedLinkId, load, myUserId]);

  const closeTaskIfHidden = useCallback(
    (id: string, nextStatus: TaskStatus) => {
      const hidden =
        statusFilter === "active" ||
        (statusFilter !== "all" && statusFilter !== nextStatus);
      if (hidden) {
        setSelectedTaskId((prev) => (prev === id ? null : prev));
      }
    },
    [statusFilter],
  );

  const complete = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await tasksApi.complete(id);
        closeTaskIfHidden(id, "DONE");
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t.errors.completeFailed);
      }
    },
    [closeTaskIfHidden, load],
  );

  const cancel = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await tasksApi.cancel(id);
        closeTaskIfHidden(id, "CANCELED");
        await load();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : t.errors.cancelFailed);
      }
    },
    [closeTaskIfHidden, load],
  );

  const saveTaskEdit = useCallback(
    async (id: string) => {
      setCardSaving(true);
      setCardError(null);
      try {
        await tasksApi.update(id, {
          title: editTitle.trim(),
          body: editBody.trim() || null,
          dueAt: editDueAt ? new Date(editDueAt).toISOString() : null,
          status: editStatus,
          assigneeId: editAssigneeId || null,
          collaboratorIds: editCollaboratorIds,
        });
        closeTaskIfHidden(id, editStatus);
        await load();
        setCardEditing(false);
      } catch (e) {
        setCardError(e instanceof Error ? e.message : t.errors.updateFailed);
      } finally {
        setCardSaving(false);
      }
    },
    [closeTaskIfHidden, editTitle, editBody, editDueAt, editStatus, editAssigneeId, editCollaboratorIds, load],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const groupedItems = useMemo(
    () => (sortBy === "priority" ? groupTasksByUrgency(items) : null),
    [items, sortBy],
  );

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  };

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

  const attentionLabel = attention ? ATTENTION_LABELS[attention] : null;

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
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white"
        >
          {showAdd ? t.cancelAdd : t.addTask}
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
              </button>
            );
          })}
        </div>
        <form
          onSubmit={onSearchSubmit}
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
        {(attentionLabel || taskIdsFilter) && (
          <div className="flex flex-wrap items-center gap-2">
            {attentionLabel ? (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                {attentionLabel}
              </span>
            ) : null}
            {taskIdsFilter ? (
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-900">
                План дня ({taskIdsFilter.split(",").filter(Boolean).length})
              </span>
            ) : null}
          </div>
        )}
        <p className="text-sm text-zinc-500">
          {interpolate(t.total, { total })}
          {totalPages > 1 ? interpolate(t.pageOf, { page, totalPages }) : ""}
        </p>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">{t.newTask}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.fields.title}</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={t.fields.titlePlaceholder}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.fields.due}</label>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">{t.fields.assignee}</label>
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              >
                {users.length === 0 && <option value="">{t.noUsers}</option>}
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">{t.fields.note}</label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder={t.fields.noteOptional}
                rows={2}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                {t.fields.linkTo} <span className="font-normal text-zinc-400">({t.fields.linkOptional})</span>
              </label>
              <div className="mt-1 flex gap-2">
                <select
                  value={linkType}
                  onChange={(e) => {
                    setLinkType(e.target.value as EntityType);
                    setLinkSearch("");
                    setSelectedLinkId(null);
                    setLinkOptions([]);
                  }}
                  className="rounded border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  <option value="contact">{t.linkedTo.contact}</option>
                  <option value="company">{t.linkedTo.company}</option>
                  <option value="lead">{t.linkedTo.lead}</option>
                  <option value="order">{t.linkedTo.order}</option>
                </select>
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder={interpolate(t.fields.searchLink, { type: taskLinkedTypeLabel(linkType) })}
                  className="flex-1 rounded border border-zinc-200 px-2 py-1.5 text-sm"
                />
              </div>
              {linkOptions.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-auto rounded border border-zinc-200 bg-white">
                  {linkOptions.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedLinkId(o.id);
                          setLinkSearch(o.label);
                          setLinkOptions([]);
                        }}
                        className={`w-full px-2 py-1.5 text-left text-sm hover:bg-zinc-100 ${
                          selectedLinkId === o.id ? "bg-zinc-100" : ""
                        }`}
                      >
                        {o.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {linkSearching && <p className="mt-1 text-xs text-zinc-500">{t.searching}</p>}
            </div>
          </div>
          {addError && (
            <p className="mt-2 text-sm text-red-600">{addError}</p>
          )}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void submitAdd()}
              disabled={saving}
              className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t.actions.creating : t.actions.create}
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">{t.loading}</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500">
          {t.empty.noMatch}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
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
                        <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                          {taskUrgencyLabel(bucket)} ({groupTasks.length})
                        </td>
                      </tr>,
                      ...groupTasks.map((task) => (
                        <TaskTableRow
                          key={task.id}
                          task={task}
                          onSelect={() => {
                            if (isTextSelected()) return;
                            setSelectedTaskId(task.id);
                          }}
                          onComplete={() => void complete(task.id)}
                          onCancel={() => void cancel(task.id)}
                        />
                      )),
                    ])
                  : items.map((task) => (
                      <TaskTableRow
                        key={task.id}
                        task={task}
                        onSelect={() => {
                          if (isTextSelected()) return;
                          setSelectedTaskId(task.id);
                        }}
                        onComplete={() => void complete(task.id)}
                        onCancel={() => void cancel(task.id)}
                      />
                    ))}
              </tbody>
            </table>
          </div>

          {selectedTask && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
              onClick={() => setSelectedTaskId(null)}
            >
              <div
                className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-zinc-200 p-4">
                  {cardEditing ? (
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
                        {editStatusOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <label className="block text-xs font-medium text-zinc-600">{t.fields.assignee}</label>
                      <select
                        value={editAssigneeId}
                        onChange={(e) => setEditAssigneeId(e.target.value)}
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
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-zinc-900">{selectedTask.title}</h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        {t.dueLabel} {formatDueAt(selectedTask.dueAt)} ·{" "}
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            selectedTask.status === "DONE"
                              ? "bg-emerald-100 text-emerald-800"
                              : selectedTask.status === "CANCELED"
                                ? "bg-zinc-100 text-zinc-600"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {taskStatusLabel(selectedTask.status)}
                        </span>
                      </p>
                    </>
                  )}
                </div>

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">{t.fields.description}</p>
                  {cardEditing ? (
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                    />
                  ) : (
                    <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-700">
                      {selectedTask.body || "—"}
                    </p>
                  )}
                </div>

                {!cardEditing ? (
                  <div className="border-b border-zinc-100 p-4">
                    <p className="text-xs font-medium text-zinc-500">{t.fields.assignee}</p>
                    <p className="mt-0.5 text-sm text-zinc-700">{selectedTask.assignee?.fullName ?? "—"}</p>
                    <p className="mt-2 text-xs font-medium text-zinc-500">{t.collaborators.title}</p>
                    {selectedTask.collaborators && selectedTask.collaborators.length > 0 ? (
                      <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
                        {selectedTask.collaborators.map((row) => (
                          <li key={row.userId}>{row.user?.fullName ?? row.userId}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-sm text-zinc-400">{t.collaborators.empty}</p>
                    )}
                    <p className="mt-2 text-xs text-zinc-500">
                      {t.fields.createdBy}: {selectedTask.createdBy?.fullName ?? "—"}
                    </p>
                  </div>
                ) : null}

                <TaskCommentsSection
                  taskId={selectedTask.id}
                  initialCount={selectedTask._count?.comments ?? 0}
                  onChanged={() => void load()}
                />

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">{t.columns.linkedTo}</p>
                  <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <TaskLinkedTo task={selectedTask} />
                  </div>
                </div>

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">{t.fields.dates}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
                    <li>
                      {t.fields.created}: {formatTaskDateCell(selectedTask.createdAt)}
                    </li>
                    <li>
                      {t.fields.updated}: {formatTaskDateCell(selectedTask.updatedAt)}
                    </li>
                    {selectedTask.completedAt && (
                      <li>
                        {t.fields.completed}: {formatTaskDateCell(selectedTask.completedAt)}
                      </li>
                    )}
                  </ul>
                </div>

                {cardError && (
                  <div className="border-b border-red-100 bg-red-50/50 px-4 py-2 text-sm text-red-700">
                    {cardError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 border-t border-zinc-200 p-4">
                  {cardEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void saveTaskEdit(selectedTask.id)}
                        disabled={cardSaving || !editTitle.trim()}
                        className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {cardSaving ? t.actions.saving : t.actions.save}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardEditing(false)}
                        disabled={cardSaving}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {t.actions.cancelEdit}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setCardEditing(true)}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        {t.actions.edit}
                      </button>
                      {(selectedTask.status === "OPEN" || selectedTask.status === "IN_PROGRESS") && (
                        <>
                          <button
                            type="button"
                            onClick={() => void complete(selectedTask.id)}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                          >
                            {t.actions.complete}
                          </button>
                          <button
                            type="button"
                            onClick={() => void cancel(selectedTask.id)}
                            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            {t.actions.cancelTask}
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedTaskId(null)}
                    className="ml-auto rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {t.actions.close}
                  </button>
                </div>
              </div>
            </div>
          )}

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
    </div>
  );
}
