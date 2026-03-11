export type CreateTaskDto = {
  title: string;
  body?: string | null;
  dueAt?: string | null; // ISO date
  contactId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  orderId?: string | null;
  assigneeId?: string | null; // optional; default actor.id, ADMIN can set
};
