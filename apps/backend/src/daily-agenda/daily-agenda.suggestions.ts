import type {
  AgendaHotLead,
  AgendaCallQueueItem,
  AgendaDebtContact,
  AgendaMissedCall,
  AgendaOverdueOrder,
  AgendaPlanItemInput,
  AgendaQueueContact,
  AgendaSuggestion,
  AgendaSuggestionCategory,
  AgendaSummary,
  DailyAgendaProfile,
  ScheduledContactAction,
  ScheduledTask,
  ScheduledVisit,
} from "./daily-agenda.types";
import {
  actionLabel,
  contactEntitySnapshot,
  taskEntitySnapshot,
  taskSubtitle,
} from "./daily-agenda.helpers";
import { itemSourceKey, visitSubtitle, visitTitle } from "./daily-agenda.proposal";
import { suggestionToPlanItem } from "./daily-agenda.suggestion-mapper";

export { planKeysFromItems } from "./daily-agenda.suggestion-keys";

export function buildSuggestions(input: {
  profile: DailyAgendaProfile;
  visits: ScheduledVisit[];
  tasks: ScheduledTask[];
  contactActions: ScheduledContactAction[];
  backlogVisits: ScheduledVisit[];
  overdueTasks: ScheduledTask[];
  queueContacts: AgendaQueueContact[];
  hotLeads: AgendaHotLead[];
  newLeads: AgendaHotLead[];
  overdueOrders: AgendaOverdueOrder[];
  callQueueItems: AgendaCallQueueItem[];
  debtContacts: AgendaDebtContact[];
  missedCalls: AgendaMissedCall[];
  planKeys: Set<string>;
}): AgendaSuggestion[] {
  const suggestions: AgendaSuggestion[] = [];
  const seen = new Set<string>();

  const add = (s: AgendaSuggestion) => {
    const key = s.suggestionKey;
    if (seen.has(key) || input.planKeys.has(key)) return;
    seen.add(key);
    suggestions.push(s);
  };

  const scheduledContactIds = new Set(
    input.visits
      .filter((v) => v.contactId && v.status !== "CANCELED")
      .map((v) => v.contactId as string),
  );

  for (const c of input.contactActions) {
    if (c.nextActionType === "MEETING" && !scheduledContactIds.has(c.contactId)) {
      add({
        suggestionKey: `meeting-no-visit:${c.contactId}`,
        kind: "CONTACT_ACTION",
        contactId: c.contactId,
        title: `Запланувати візит · ${c.fullName}`,
        subtitle: contactEntitySnapshot(c).companyName ?? c.nextActionNote,
        scheduledAt: c.nextActionAt,
        reason: "Запланована зустріч без візиту на сьогодні",
        metadata: {
          nextActionType: "MEETING",
          actionHref: "/visits",
          entityHref: `/contacts?open=${c.contactId}`,
          suggestionCategory: "scheduled",
          entitySnapshot: contactEntitySnapshot(c),
        },
      });
    }
    if (input.profile === "office" && c.nextActionType === "CALL") {
      add({
        suggestionKey: `call:${c.contactId}`,
        kind: "CONTACT_ACTION",
        contactId: c.contactId,
        title: `${actionLabel("CALL")} · ${c.fullName}`,
        subtitle: contactEntitySnapshot(c).companyName ?? c.phone,
        scheduledAt: c.nextActionAt,
        reason: "Запланований дзвінок на сьогодні",
        metadata: {
          nextActionType: "CALL",
          actionHref: "/work/calls",
          entityHref: `/contacts?open=${c.contactId}`,
          suggestionCategory: "scheduled",
          entitySnapshot: contactEntitySnapshot(c),
        },
      });
    }
  }

  for (const t of input.overdueTasks) {
    add({
      suggestionKey: `overdue-task:${t.id}`,
      kind: "TASK",
      taskId: t.id,
      title: `Прострочена задача · ${t.title}`,
      subtitle: taskSubtitle(t),
      scheduledAt: t.dueAt,
      reason: "Задача прострочена",
      metadata: {
        actionHref: "/tasks",
        entityHref: t.contactId
          ? `/contacts?open=${t.contactId}`
          : t.leadId
            ? `/leads?open=${t.leadId}`
            : "/tasks",
        suggestionCategory: "overdue",
        entitySnapshot: taskEntitySnapshot(t),
      },
    });
  }

  if (input.profile === "office") {
    for (const q of input.queueContacts.slice(0, 10)) {
      add({
        suggestionKey: `queue:${q.contactId}`,
        kind: "SUGGESTION",
        contactId: q.contactId,
        title: `Черга · ${q.fullName}`,
        subtitle: [q.companyName, q.phone].filter(Boolean).join(" · ") || null,
        reason: q.priorityReasons[0] ?? "Пріоритетний контакт з черги",
        metadata: {
          actionHref: "/work/calls/queue",
          entityHref: `/contacts?open=${q.contactId}`,
          suggestionCategory: "queue",
          entitySnapshot: contactEntitySnapshot(q),
        },
      });
    }
  }

  if (input.profile === "field") {
    for (const v of input.backlogVisits) {
      add({
        suggestionKey: `backlog-visit:${v.id}`,
        kind: "VISIT",
        visitId: v.id,
        title: `Додати в маршрут · ${visitTitle(v)}`,
        subtitle: visitSubtitle(v),
        reason: "Візит без часу в беклозі",
        metadata: {
          actionHref: "/visits",
          entityHref: v.contactId ? `/contacts?open=${v.contactId}` : "/visits",
          suggestionCategory: "route",
          entitySnapshot: {
            contactName: v.contactName ?? undefined,
            companyName: v.companyName ?? undefined,
          },
        },
      });
    }
  }

  for (const lead of [...input.hotLeads, ...input.newLeads]) {
    const key = lead.status === "NEW" ? `new-lead:${lead.id}` : `hot-lead:${lead.id}`;
    add({
      suggestionKey: key,
      kind: "LEAD",
      leadId: lead.id,
      title: lead.status === "NEW" ? `Новий лід · ${lead.name}` : `Лід без дотику · ${lead.name}`,
      subtitle: [lead.companyName, lead.source].filter(Boolean).join(" · ") || null,
      reason:
        lead.status === "NEW"
          ? "Новий лід без першого контакту"
          : lead.daysSinceActivity != null
            ? `Без активності ${lead.daysSinceActivity} дн.`
            : "Лід потребує уваги",
      metadata: {
        actionHref: "/leads",
        entityHref: `/leads?open=${lead.id}`,
        suggestionCategory: "leads",
        entitySnapshot: {
          leadName: lead.name,
          leadStatus: lead.status,
          companyName: lead.companyName ?? undefined,
          daysOverdue: lead.daysSinceActivity ?? undefined,
        },
      },
    });
  }

  for (const order of input.overdueOrders) {
    add({
      suggestionKey: `overdue-order:${order.id}`,
      kind: "SUGGESTION",
      title: `Прострочена оплата · ${order.orderNumber}`,
      subtitle: [
        order.companyName ?? order.contactName,
        order.daysOverdue != null ? `${order.daysOverdue} дн.` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      reason: "Прострочена оплата по замовленню",
      metadata: {
        orderId: order.id,
        actionHref: `/orders?open=${order.id}`,
        entityHref: `/orders?open=${order.id}`,
        suggestionCategory: "orders",
        entitySnapshot: {
          orderNumber: order.orderNumber,
          orderId: order.id,
          amount: order.debtAmount,
          currency: order.currency,
          contactName: order.contactName ?? undefined,
          companyName: order.companyName ?? undefined,
          daysOverdue: order.daysOverdue ?? undefined,
        },
      },
    });
  }

  for (const item of input.callQueueItems) {
    const name = item.contactName ?? item.leadName ?? "Контакт";
    add({
      suggestionKey: `call-queue:${item.queueItemId}`,
      kind: "SUGGESTION",
      contactId: item.contactId ?? undefined,
      leadId: item.leadId ?? undefined,
      title: `Черга дзвінків · ${name}`,
      subtitle: [item.companyName, item.phone].filter(Boolean).join(" · ") || null,
      reason: "Контакт у черзі дзвінків",
      metadata: {
        actionHref: "/work/calls/queue",
        entityHref: item.contactId
          ? `/contacts?open=${item.contactId}`
          : item.leadId
            ? `/leads?open=${item.leadId}`
            : "/work/calls/queue",
        suggestionCategory: "calls",
        entitySnapshot: {
          contactName: item.contactName ?? undefined,
          leadName: item.leadName ?? undefined,
          companyName: item.companyName ?? undefined,
          phone: item.phone ?? undefined,
        },
      },
    });
  }

  for (const c of input.debtContacts) {
    add({
      suggestionKey: `debt:${c.contactId}`,
      kind: "CONTACT_ACTION",
      contactId: c.contactId,
      title: `Контроль боргу · ${c.fullName}`,
      subtitle: [c.companyName, c.debtAmount > 0 ? `${c.debtAmount} грн` : null]
        .filter(Boolean)
        .join(" · ") || null,
      reason: "Контакт з боргом потребує контролю",
      metadata: {
        nextActionType: "CONTROL_PAYMENT",
        actionHref: `/contacts?open=${c.contactId}`,
        entityHref: `/contacts?open=${c.contactId}`,
        suggestionCategory: "debt",
        entitySnapshot: contactEntitySnapshot({
          fullName: c.fullName,
          companyName: c.companyName,
          phone: c.phone,
          priorityScore: c.priorityScore,
        }),
      },
    });
  }

  for (const call of input.missedCalls) {
    add({
      suggestionKey: `missed-call:${call.callId}`,
      kind: "SUGGESTION",
      contactId: call.contactId ?? undefined,
      leadId: call.leadId ?? undefined,
      title: `Пропущений дзвінок · ${call.contactName ?? call.phone ?? "Клієнт"}`,
      subtitle: call.phone,
      reason: "Пропущений вхідний дзвінок сьогодні",
      metadata: {
        actionHref: "/work/calls",
        entityHref: call.contactId ? `/contacts?open=${call.contactId}` : "/work/calls",
        suggestionCategory: "calls",
        entitySnapshot: {
          contactName: call.contactName ?? undefined,
          phone: call.phone ?? undefined,
        },
      },
    });
  }

  return suggestions;
}

export function groupSuggestions(
  suggestions: AgendaSuggestion[],
): Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>> {
  const groups: Partial<Record<AgendaSuggestionCategory, AgendaSuggestion[]>> = {};
  for (const s of suggestions) {
    const cat = s.metadata?.suggestionCategory ?? "overdue";
    if (!groups[cat]) groups[cat] = [];
    groups[cat]!.push(s);
  }
  return groups;
}

export function buildAgendaSummary(input: {
  scheduled: { visits: ScheduledVisit[]; tasks: ScheduledTask[]; contactActions: ScheduledContactAction[] };
  suggestions: AgendaSuggestion[];
  planItems: AgendaPlanItemInput[];
}): AgendaSummary {
  const grouped = groupSuggestions(input.suggestions);
  const suggestionCounts: Partial<Record<AgendaSuggestionCategory, number>> = {};
  for (const [cat, items] of Object.entries(grouped)) {
    suggestionCounts[cat as AgendaSuggestionCategory] = items?.length ?? 0;
  }

  const plan = input.planItems;
  const countKind = (kind: string) => plan.filter((i) => i.kind === kind).length;
  const callsInPlan =
    plan.filter(
      (i) =>
        i.kind === "CONTACT_ACTION" &&
        (i.metadata?.nextActionType === "CALL" || i.metadata?.suggestionCategory === "calls"),
    ).length +
    plan.filter((i) => i.kind === "SUGGESTION" && i.metadata?.suggestionCategory === "calls").length;

  return {
    scheduled: {
      visits: input.scheduled.visits.length,
      tasks: input.scheduled.tasks.length,
      contactActions: input.scheduled.contactActions.length,
    },
    suggestions: suggestionCounts,
    plan: {
      total: plan.length,
      visits: countKind("VISIT"),
      calls: callsInPlan,
      tasks: countKind("TASK"),
      leads: countKind("LEAD"),
      orders: plan.filter((i) => i.metadata?.orderId).length,
    },
  };
}

/** Pick seed suggestions for smart default proposal. */
export function pickSeedSuggestions(input: {
  profile: DailyAgendaProfile;
  suggestions: AgendaSuggestion[];
}): AgendaSuggestion[] {
  const byKey = (cat: AgendaSuggestionCategory, limit: number) =>
    input.suggestions.filter((s) => s.metadata?.suggestionCategory === cat).slice(0, limit);

  if (input.profile === "field") {
    return [
      ...byKey("overdue", 3),
      ...byKey("route", 3),
      ...byKey("scheduled", 2),
    ];
  }
  return [
    ...byKey("overdue", 3),
    ...byKey("queue", 3),
    ...byKey("leads", 2),
    ...byKey("orders", 2),
    ...byKey("calls", 2),
  ];
}

export { suggestionToPlanItem };
