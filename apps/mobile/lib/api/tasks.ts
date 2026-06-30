import { apiFetch } from "@/lib/api";
import type { ListTasksResponse, Task, TaskStatus, UpdateTaskBody } from "@/types/crm";

function qs(params: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

export type ListTasksQuery = {
  status?: TaskStatus | TaskStatus[];
  dueFrom?: string;
  dueTo?: string;
  q?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "dueAt" | "createdAt" | "updatedAt";
  sortDir?: "asc" | "desc";
};

function statusParam(status: TaskStatus | TaskStatus[] | undefined): string | undefined {
  if (!status) return undefined;
  return Array.isArray(status) ? status.join(",") : status;
}

export const tasksApi = {
  list: (token: string, query: ListTasksQuery = {}) =>
    apiFetch<ListTasksResponse>(
      `/tasks${qs({
        status: statusParam(query.status),
        dueFrom: query.dueFrom,
        dueTo: query.dueTo,
        q: query.q,
        page: query.page,
        pageSize: query.pageSize ?? 50,
        sortBy: query.sortBy ?? "dueAt",
        sortDir: query.sortDir ?? "asc",
      })}`,
      { token },
    ),

  complete: (token: string, id: string) =>
    apiFetch<Task>(`/tasks/${id}/complete`, { method: "POST", token }),

  getById: (token: string, id: string) => apiFetch<Task>(`/tasks/${id}`, { token }),

  create: (
    token: string,
    body: { title: string; body?: string | null; dueAt?: string | null; contactId?: string | null },
  ) =>
    apiFetch<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),

  update: (token: string, id: string, body: UpdateTaskBody) =>
    apiFetch<Task>(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      token,
    }),

  cancel: (token: string, id: string) =>
    apiFetch<Task>(`/tasks/${id}/cancel`, { method: "POST", token }),
};
