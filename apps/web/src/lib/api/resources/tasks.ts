import { apiHttp } from "../client";

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELED";

export type Task = {
  id: string;
  assigneeId: string;
  assignee?: { id: string; fullName: string } | null;
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
  title: string;
  body?: string | null;
  dueAt?: string | null;
  status: TaskStatus;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskSortField = "dueAt" | "createdAt" | "updatedAt";

export type ListTasksQuery = {
  assigneeId?: string;
  contactId?: string;
  companyId?: string;
  leadId?: string;
  orderId?: string;
  status?: TaskStatus | TaskStatus[];
  dueFrom?: string;
  dueTo?: string;
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
};

export type UpdateTaskBody = Partial<{
  title: string;
  body: string | null;
  dueAt: string | null;
  status: TaskStatus;
}>;

export const tasksApi = {
  list: async (query: ListTasksQuery = {}): Promise<ListTasksResponse> => {
    const params: Record<string, string | number | undefined> = {};
    if (query.assigneeId) params.assigneeId = query.assigneeId;
    if (query.contactId) params.contactId = query.contactId;
    if (query.companyId) params.companyId = query.companyId;
    if (query.leadId) params.leadId = query.leadId;
    if (query.orderId) params.orderId = query.orderId;
    if (query.status != null) {
      params.status = Array.isArray(query.status) ? query.status.join(",") : query.status;
    }
    if (query.dueFrom) params.dueFrom = query.dueFrom;
    if (query.dueTo) params.dueTo = query.dueTo;
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
};
