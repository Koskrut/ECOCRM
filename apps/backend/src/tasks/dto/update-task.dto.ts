import type { TaskStatus } from "@prisma/client";

export type UpdateTaskDto = {
  title?: string;
  body?: string | null;
  dueAt?: string | null; // ISO date
  status?: TaskStatus;
  assigneeId?: string | null;
  collaboratorIds?: string[];
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
};
