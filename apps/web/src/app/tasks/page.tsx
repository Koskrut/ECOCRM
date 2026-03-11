"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListTodo } from "lucide-react";
import { tasksApi, type Task, type TaskStatus, type TaskSortField } from "@/lib/api/resources/tasks";
import { apiHttp } from "@/lib/api/client";

const TASK_STATUS_OPTIONS: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "CANCELED", label: "Canceled" },
];

const PERIOD_OPTIONS: { value: "" | "week" | "overdue"; label: string }[] = [
  { value: "", label: "All time" },
  { value: "week", label: "This week" },
  { value: "overdue", label: "Overdue" },
];

const SORT_OPTIONS: { sortBy: TaskSortField; sortDir: "asc" | "desc"; label: string }[] = [
  { sortBy: "dueAt", sortDir: "asc", label: "Due date (nearest)" },
  { sortBy: "dueAt", sortDir: "desc", label: "Due date (latest)" },
  { sortBy: "createdAt", sortDir: "desc", label: "Created (newest)" },
  { sortBy: "createdAt", sortDir: "asc", label: "Created (oldest)" },
  { sortBy: "updatedAt", sortDir: "desc", label: "Updated (newest)" },
];

function formatDueAt(dueAt: string | null | undefined): string {
  if (!dueAt) return "—";
  return new Date(dueAt).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPeriodBounds(period: "" | "week" | "overdue"): { dueFrom?: string; dueTo?: string; status?: TaskStatus[] } {
  const now = new Date();
  if (period === "week") {
    const day = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { dueFrom: start.toISOString(), dueTo: end.toISOString() };
  }
  if (period === "overdue") {
    return { dueTo: now.toISOString(), status: ["OPEN", "IN_PROGRESS"] };
  }
  return {};
}

function TaskLinkedTo({ task }: { task: Task }) {
  const links: { href: string; label: string }[] = [];
  if (task.contactId) links.push({ href: `/contacts?contactId=${task.contactId}`, label: "Contact" });
  if (task.companyId) links.push({ href: `/companies?companyId=${task.companyId}`, label: "Company" });
  if (task.leadId) links.push({ href: `/leads?leadId=${task.leadId}`, label: "Lead" });
  if (task.orderId) links.push({ href: `/orders?orderId=${task.orderId}`, label: "Order" });
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

type EntityType = "contact" | "company" | "lead" | "order";

type SearchOption = { id: string; label: string };

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [periodFilter, setPeriodFilter] = useState<"" | "week" | "overdue">("");
  const [sortBy, setSortBy] = useState<TaskSortField>("dueAt");
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

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = items.find((t) => t.id === selectedTaskId) ?? null;
  const [cardEditing, setCardEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editStatus, setEditStatus] = useState<TaskStatus>("OPEN");
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTask) {
      setEditTitle(selectedTask.title);
      setEditBody(selectedTask.body ?? "");
      setEditDueAt(selectedTask.dueAt ? new Date(selectedTask.dueAt).toISOString().slice(0, 16) : "");
      setEditStatus(selectedTask.status);
      setCardEditing(false);
      setCardError(null);
    }
  }, [selectedTask?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const period = getPeriodBounds(periodFilter);
      const res = await tasksApi.list({
        status: period.status ?? (statusFilter || undefined),
        dueFrom: period.dueFrom,
        dueTo: period.dueTo,
        sortBy,
        sortDir,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, periodFilter, sortBy, sortDir, page]);

  useEffect(() => {
    void load();
  }, [load]);

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
        setLinkOptions(list.map((c) => ({ id: c.id, label: `${c.firstName} ${c.lastName} — ${c.phone}` })));
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
        setLinkOptions(list.map((l) => ({ id: l.id, label: [l.fullName, l.phone, l.companyName].filter(Boolean).join(" — ") || l.id })));
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
      setAddError("Title is required");
      return;
    }
    const body: Parameters<typeof tasksApi.create>[0] = {
      title: newTitle.trim(),
      body: newBody.trim() || undefined,
      dueAt: newDueAt.trim() || undefined,
    };
    if (selectedLinkId) {
      if (linkType === "contact") body.contactId = selectedLinkId;
      else if (linkType === "company") body.companyId = selectedLinkId;
      else if (linkType === "lead") body.leadId = selectedLinkId;
      else body.orderId = selectedLinkId;
    }
    if (!body.contactId && !body.companyId && !body.leadId && !body.orderId) {
      setAddError("Link task to a contact, company, lead or order");
      return;
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
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to create task");
    } finally {
      setSaving(false);
    }
  }, [newTitle, newBody, newDueAt, linkType, selectedLinkId, load]);

  const complete = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        await load();
      } catch {
        // ignore
      }
    },
    [load],
  );

  const cancel = useCallback(
    async (id: string) => {
      try {
        await tasksApi.cancel(id);
        await load();
      } catch {
        // ignore
      }
    },
    [load],
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
        });
        await load();
        setCardEditing(false);
      } catch (e) {
        setCardError(e instanceof Error ? e.message : "Failed to update task");
      } finally {
        setCardSaving(false);
      }
    },
    [editTitle, editBody, editDueAt, editStatus, load],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
          <ListTodo className="h-7 w-7 text-zinc-600" />
          My tasks
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value as "" | "week" | "overdue");
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as TaskStatus | "");
              setPage(1);
            }}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            {TASK_STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
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
            {SORT_OPTIONS.map((o) => (
              <option key={`${o.sortBy}-${o.sortDir}`} value={`${o.sortBy}-${o.sortDir}`}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="rounded-lg bg-accent-gradient px-3 py-2 text-sm font-medium text-white"
          >
            {showAdd ? "Cancel" : "+ Add task"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-700">New task</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">Title</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title"
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Due</label>
              <input
                type="datetime-local"
                value={newDueAt}
                onChange={(e) => setNewDueAt(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">Note</label>
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Optional"
                rows={2}
                className="mt-1 w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Link to</label>
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
                  <option value="contact">Contact</option>
                  <option value="company">Company</option>
                  <option value="lead">Lead</option>
                  <option value="order">Order</option>
                </select>
                <input
                  type="text"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  placeholder={`Search ${linkType}…`}
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
              {linkSearching && <p className="mt-1 text-xs text-zinc-500">Searching…</p>}
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
              {saving ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading tasks…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500">
          No tasks match the filter.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/80">
                  <th className="px-4 py-3 font-medium text-zinc-700">Title</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Due</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Assignee</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Linked to</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Created</th>
                  <th className="px-4 py-3 font-medium text-zinc-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((task) => (
                  <tr
                    key={task.id}
                    className="cursor-pointer border-b border-zinc-100 hover:bg-zinc-50/80"
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900">{task.title}</p>
                      {task.body && (
                        <p className="mt-0.5 truncate text-xs text-zinc-500">{task.body}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatDueAt(task.dueAt)}</td>
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
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{task.assignee?.fullName ?? "—"}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <TaskLinkedTo task={task} />
                    </td>
                    <td className="px-4 py-3 text-zinc-500 text-xs">{formatDate(task.createdAt)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
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
                    </td>
                  </tr>
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
                className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-zinc-200 p-4">
                  {cardEditing ? (
                    <div className="space-y-3">
                      <label className="block text-xs font-medium text-zinc-600">Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                      <label className="block text-xs font-medium text-zinc-600">Due</label>
                      <input
                        type="datetime-local"
                        value={editDueAt}
                        onChange={(e) => setEditDueAt(e.target.value)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      />
                      <label className="block text-xs font-medium text-zinc-600">Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                        className="w-full rounded border border-zinc-200 px-2 py-1.5 text-sm"
                      >
                        {TASK_STATUS_OPTIONS.filter((o) => o.value !== "").map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-zinc-900">{selectedTask.title}</h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        Due: {formatDueAt(selectedTask.dueAt)} ·{" "}
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            selectedTask.status === "DONE"
                              ? "bg-emerald-100 text-emerald-800"
                              : selectedTask.status === "CANCELED"
                                ? "bg-zinc-100 text-zinc-600"
                                : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {selectedTask.status}
                        </span>
                      </p>
                    </>
                  )}
                </div>

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">Description</p>
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

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">Assignee</p>
                  <p className="mt-0.5 text-sm text-zinc-700">{selectedTask.assignee?.fullName ?? "—"}</p>
                </div>

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">Linked to</p>
                  <div className="mt-0.5" onClick={(e) => e.stopPropagation()}>
                    <TaskLinkedTo task={selectedTask} />
                  </div>
                </div>

                <div className="border-b border-zinc-100 p-4">
                  <p className="text-xs font-medium text-zinc-500">Dates</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-zinc-700">
                    <li>Created: {formatDate(selectedTask.createdAt)}</li>
                    <li>Updated: {formatDate(selectedTask.updatedAt)}</li>
                    {selectedTask.completedAt && (
                      <li>Completed: {formatDate(selectedTask.completedAt)}</li>
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
                        {cardSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCardEditing(false)}
                        disabled={cardSaving}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Cancel edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setCardEditing(true)}
                        className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Edit
                      </button>
                      {(selectedTask.status === "OPEN" || selectedTask.status === "IN_PROGRESS") && (
                        <>
                          <button
                            type="button"
                            onClick={() => void complete(selectedTask.id).then(() => setSelectedTaskId(null))}
                            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            onClick={() => void cancel(selectedTask.id).then(() => setSelectedTaskId(null))}
                            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                          >
                            Cancel task
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
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-zinc-600">
              <span>
                Page {page} of {totalPages} ({total} tasks)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded border border-zinc-200 px-2 py-1 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
