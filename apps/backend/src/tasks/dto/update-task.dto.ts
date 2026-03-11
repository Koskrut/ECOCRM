import type { TaskStatus } from "@prisma/client";

export type UpdateTaskDto = {
  title?: string;
  body?: string | null;
  dueAt?: string | null; // ISO date
  status?: TaskStatus;
};
