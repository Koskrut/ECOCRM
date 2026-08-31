import type { TaskSortField, TaskStatusFilter } from "@/lib/api/resources/tasks";

export type TaskView = "mine" | "delegated" | "all" | "overdue" | "today";

export type TasksUrlState = {
  view: TaskView;
  attention: "" | "overdue";
  period: "" | "week" | "overdue";
  status: TaskStatusFilter;
  assigneeId: string;
  q: string;
  sortBy: TaskSortField;
  sortDir: "asc" | "desc";
  page: number;
  taskId: string;
  ids: string;
};

type SearchParamsLike = {
  get: (key: string) => string | null;
};

const VIEWS: TaskView[] = ["mine", "delegated", "all", "overdue", "today"];
const STATUS_FILTERS: TaskStatusFilter[] = [
  "active",
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELED",
  "all",
];
const SORT_FIELDS: TaskSortField[] = ["priority", "dueAt", "createdAt", "updatedAt"];

function parseView(raw: string | null, attention: "" | "overdue", period: "" | "week" | "overdue"): TaskView {
  if (raw && VIEWS.includes(raw as TaskView)) return raw as TaskView;
  if (attention === "overdue" || period === "overdue") return "overdue";
  return "mine";
}

function parseStatus(raw: string | null): TaskStatusFilter {
  if (raw && STATUS_FILTERS.includes(raw as TaskStatusFilter)) return raw as TaskStatusFilter;
  return "active";
}

function parseSortBy(raw: string | null): TaskSortField {
  if (raw && SORT_FIELDS.includes(raw as TaskSortField)) return raw as TaskSortField;
  return "priority";
}

function parseSortDir(raw: string | null, sortBy: TaskSortField): "asc" | "desc" {
  if (raw === "asc" || raw === "desc") return raw;
  return sortBy === "createdAt" || sortBy === "updatedAt" ? "desc" : "asc";
}

export function parseTasksUrl(sp: SearchParamsLike): TasksUrlState {
  const attention = sp.get("attention") === "overdue" ? "overdue" : ("" as const);
  const periodRaw = sp.get("period");
  const period =
    periodRaw === "week" || periodRaw === "overdue"
      ? periodRaw
      : attention === "overdue"
        ? ("overdue" as const)
        : ("" as const);
  const sortBy = parseSortBy(sp.get("sortBy"));
  const pageRaw = Number(sp.get("page") ?? "1");
  return {
    view: parseView(sp.get("view"), attention, period),
    attention,
    period,
    status: parseStatus(sp.get("status")),
    assigneeId: (sp.get("assigneeId") ?? "").trim(),
    q: (sp.get("q") ?? "").trim(),
    sortBy,
    sortDir: parseSortDir(sp.get("sortDir"), sortBy),
    page: Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1,
    taskId: (sp.get("taskId") ?? "").trim(),
    ids: (sp.get("ids") ?? "").trim(),
  };
}

export function buildTasksSearchParams(state: TasksUrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.view !== "mine") params.set("view", state.view);
  if (state.attention) params.set("attention", state.attention);
  else if (state.period === "overdue") params.set("period", "overdue");
  else if (state.period === "week") params.set("period", "week");
  if (state.status !== "active") params.set("status", state.status);
  if (state.assigneeId) params.set("assigneeId", state.assigneeId);
  if (state.q) params.set("q", state.q);
  if (state.sortBy !== "priority") params.set("sortBy", state.sortBy);
  if (
    state.sortDir !== "asc" ||
    state.sortBy === "createdAt" ||
    state.sortBy === "updatedAt"
  ) {
    if (!(state.sortBy === "priority" && state.sortDir === "asc")) {
      params.set("sortDir", state.sortDir);
    }
  }
  if (state.page > 1) params.set("page", String(state.page));
  if (state.ids) params.set("ids", state.ids);
  if (state.taskId) params.set("taskId", state.taskId);
  return params;
}

export const DEFAULT_TASKS_URL: TasksUrlState = {
  view: "mine",
  attention: "",
  period: "",
  status: "active",
  assigneeId: "",
  q: "",
  sortBy: "priority",
  sortDir: "asc",
  page: 1,
  taskId: "",
  ids: "",
};
