import type { TaskStatus } from "@prisma/client";

export type TaskSortField = "priority" | "dueAt" | "createdAt" | "updatedAt";

export type TaskAttentionPreset = "overdue";

export type ListTasksQueryDto = {
  assigneeId?: string;
  createdById?: string;
  delegated?: boolean;
  contactId?: string;
  companyId?: string;
  leadId?: string;
  orderId?: string;
  status?: TaskStatus | TaskStatus[];
  dueFrom?: string; // ISO date
  dueTo?: string;   // ISO date
  attention?: TaskAttentionPreset;
  ids?: string;
  q?: string;
  sortBy?: TaskSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};
