import type { TaskStatus } from "@prisma/client";

export type TaskSortField = "dueAt" | "createdAt" | "updatedAt";

export type ListTasksQueryDto = {
  assigneeId?: string;
  contactId?: string;
  companyId?: string;
  leadId?: string;
  orderId?: string;
  status?: TaskStatus | TaskStatus[];
  dueFrom?: string; // ISO date
  dueTo?: string;   // ISO date
  sortBy?: TaskSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};
