import type { DayPlanTemplate } from "./day-plan.types";

/** Default norms (Phase 1). Override via systemSetting id `day_plan_templates`. */
export const DEFAULT_OFFICE_DAY_PLAN: DayPlanTemplate = {
  profile: "office",
  items: [
    {
      key: "calls_outbound",
      label: "Вихідні дзвінки",
      kind: "target",
      target: 15,
      weight: 25,
      actionHref: "/work/calls",
    },
    {
      key: "leads_new_processed",
      label: "Нові ліди оброблено",
      kind: "target",
      target: 0,
      weight: 20,
      actionHref: "/leads?status=NEW",
    },
    {
      key: "tasks_due_today_done",
      label: "Задачі на сьогодні",
      kind: "target",
      target: 0,
      weight: 20,
      actionHref: "/tasks",
    },
    {
      key: "overdue_tasks_zero",
      label: "Прострочені задачі",
      kind: "zero_target",
      target: 0,
      weight: 15,
      actionHref: "/tasks",
    },
    {
      key: "work_queue_touches",
      label: "Касання з черги контактів",
      kind: "target",
      target: 5,
      weight: 10,
      actionHref: "/work/calls/queue",
    },
    {
      key: "orders_created",
      label: "Створені замовлення",
      kind: "target",
      target: 1,
      weight: 10,
      actionHref: "/orders",
    },
  ],
};

export const DEFAULT_FIELD_DAY_PLAN: DayPlanTemplate = {
  profile: "field",
  items: [
    {
      key: "visits_from_plan_done",
      label: "Візити за маршрутом",
      kind: "target",
      target: 0,
      weight: 35,
      actionHref: "/visits",
    },
    {
      key: "visits_total_done",
      label: "Завершені візити",
      kind: "target",
      target: 6,
      weight: 25,
      actionHref: "/visits",
    },
    {
      key: "field_shift_started",
      label: "Старт зміни",
      kind: "target",
      target: 1,
      weight: 15,
      actionHref: "/visits",
    },
    {
      key: "tasks_due_today_done",
      label: "Задачі на сьогодні",
      kind: "target",
      target: 0,
      weight: 15,
      actionHref: "/tasks",
    },
    {
      key: "calls_outbound",
      label: "Вихідні дзвінки",
      kind: "target",
      target: 5,
      weight: 10,
      actionHref: "/work/calls",
    },
  ],
};

export const DAY_PLAN_STATUS_THRESHOLDS = {
  green: 80,
  yellow: 50,
} as const;
