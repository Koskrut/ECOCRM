import type {
  AgendaPlanItemInput,
  AgendaSuggestion,
  AgendaSuggestionCategory,
} from "@/lib/api/resources/daily-agenda";

export type AgendaSummaryLinks = Partial<
  Record<"visits" | "calls" | "tasks" | "leads" | "orders", string>
>;

export function buildAgendaSummaryLinks(input: {
  date: string;
  profile: "office" | "field";
  items: AgendaPlanItemInput[];
  groupedSuggestions: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>>;
}): AgendaSummaryLinks {
  const leadIds = new Set<string>();
  const visitIds = new Set<string>();
  const taskIds = new Set<string>();
  const orderIds = new Set<string>();

  for (const item of input.items) {
    if (item.leadId) leadIds.add(item.leadId);
    if (item.visitId) visitIds.add(item.visitId);
    if (item.taskId) taskIds.add(item.taskId);
    if (item.metadata?.orderId) orderIds.add(item.metadata.orderId);
  }
  for (const s of input.groupedSuggestions.leads ?? []) {
    if (s.leadId) leadIds.add(s.leadId);
  }
  for (const cat of ["scheduled", "route", "overdue"] as const) {
    for (const s of input.groupedSuggestions[cat] ?? []) {
      if (s.visitId) visitIds.add(s.visitId);
      if (s.taskId) taskIds.add(s.taskId);
    }
  }
  for (const s of input.groupedSuggestions.orders ?? []) {
    if (s.metadata?.orderId) orderIds.add(s.metadata.orderId);
  }

  const links: AgendaSummaryLinks = {
    visits:
      visitIds.size > 0
        ? `/visits?date=${input.date}&ids=${[...visitIds].join(",")}`
        : `/visits?date=${input.date}`,
    tasks:
      taskIds.size > 0
        ? `/tasks?ids=${[...taskIds].join(",")}`
        : "/tasks?attention=overdue",
    orders:
      orderIds.size > 0
        ? `/orders?ids=${[...orderIds].join(",")}`
        : "/orders?attention=overdue-payments",
  };

  if (input.profile === "office") {
    links.calls = "/work/calls/queue";
    links.leads =
      leadIds.size > 0
        ? `/leads?ids=${[...leadIds].join(",")}`
        : "/leads?attention=without-touch";
  }

  return links;
}
