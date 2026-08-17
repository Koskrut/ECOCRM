import { apiHttp } from "../client";

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELED";

/** Statuses shown in default task inbox (open work queue). */
export const ACTIVE_TASK_STATUSES: TaskStatus[] = ["OPEN", "IN_PROGRESS"];

export type TaskStatusFilter = "active" | "all" | TaskStatus;

export function resolveTaskListStatus(
  statusFilter: TaskStatusFilter,
  periodStatus?: TaskStatus[],
): TaskStatus | TaskStatus[] | undefined {
  if (periodStatus) return periodStatus;
  if (statusFilter === "active") return ACTIVE_TASK_STATUSES;
  if (statusFilter === "all") return undefined;
  return statusFilter;
}

export type TaskCollaborator = {
  userId: string;
  user?: { id: string; fullName: string } | null;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  author?: { id: string; fullName: string } | null;
  body: string;
  createdAt: string;
};

export type Task = {
  id: string;
  assigneeId: string;
  assignee?: { id: string; fullName: string } | null;
  createdById?: string | null;
  createdBy?: { id: string; fullName: string } | null;
  collaborators?: TaskCollaborator[];
  _count?: { comments: number };
  contactId?: string | null;
  contact?: { id: string; firstName: string; lastName: string; phone: string } | null;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  leadId?: string | null;
  lead?: { id: string; fullName: string | null; phone: string | null; companyName: string | null } | null;
  orderId?: string | null;
  order?: { id: string; orderNumber: string } | null;
  title: string;
  body?: string | null;
  dueAt?: string | null;
  status: TaskStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSortField = "priority" | "dueAt" | "createdAt" | "updatedAt";

export type TaskAttentionPreset = "overdue";

export type ListTasksQuery = {
  assigneeId?: string;
  createdById?: string;
  delegated?: boolean;
  contactId?: string;
  companyId?: string;
  leadId?: string;
  orderId?: string;
  status?: TaskStatus | TaskStatus[];
  dueFrom?: string;
  dueTo?: string;
  attention?: TaskAttentionPreset;
  ids?: string;
  q?: string;
  sortBy?: TaskSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};


export type ListTasksResponse = {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateTaskBody = {
  title: string;
  body?: string | null;
  dueAt?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
  assigneeId?: string | null;
  collaboratorIds?: string[];
};

export type UpdateTaskBody = Partial<{
  title: string;
  body: string | null;
  dueAt: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  collaboratorIds?: string[];
}>;

export const tasksApi = {
  list: async (query: ListTasksQuery = {}): Promise<ListTasksResponse> => {
    const params: Record<string, string | number | undefined> = {};
    if (query.assigneeId) params.assigneeId = query.assigneeId;
    if (query.createdById) params.createdById = query.createdById;
    if (query.delegated) params.delegated = "1";
    if (query.contactId) params.contactId = query.contactId;
    if (query.companyId) params.companyId = query.companyId;
    if (query.leadId) params.leadId = query.leadId;
    if (query.orderId) params.orderId = query.orderId;
    if (query.status != null) {
      params.status = Array.isArray(query.status) ? query.status.join(",") : query.status;
    }
    if (query.dueFrom) params.dueFrom = query.dueFrom;
    if (query.dueTo) params.dueTo = query.dueTo;
    if (query.attention) params.attention = query.attention;
    if (query.ids) params.ids = query.ids;
    if (query.q?.trim()) params.q = query.q.trim();
    if (query.sortBy) params.sortBy = query.sortBy;
    if (query.sortDir) params.sortDir = query.sortDir;
    if (query.page != null) params.page = query.page;
    if (query.pageSize != null) params.pageSize = query.pageSize;
    const res = await apiHttp.get<ListTasksResponse>("/tasks", { params } as never);
    return res.data;
  },

  create: async (body: CreateTaskBody): Promise<Task> => {
    const res = await apiHttp.post<Task>("/tasks", body);
    return res.data;
  },

  get: async (id: string): Promise<Task> => {
    const res = await apiHttp.get<Task>(`/tasks/${id}`);
    return res.data;
  },

  update: async (id: string, body: UpdateTaskBody): Promise<Task> => {
    const res = await apiHttp.patch<Task>(`/tasks/${id}`, body);
    return res.data;
  },

  complete: async (id: string): Promise<Task> => {
    const res = await apiHttp.post<Task>(`/tasks/${id}/complete`);
    return res.data;
  },

  cancel: async (id: string): Promise<Task> => {
    const res = await apiHttp.post<Task>(`/tasks/${id}/cancel`);
    return res.data;
  },

  listComments: async (id: string): Promise<{ items: TaskComment[] }> => {
    const res = await apiHttp.get<{ items: TaskComment[] }>(`/tasks/${id}/comments`);
    return res.data;
  },

  addComment: async (id: string, body: string): Promise<TaskComment> => {
    const res = await apiHttp.post<TaskComment>(`/tasks/${id}/comments`, { body });
    return res.data;
  },
};
