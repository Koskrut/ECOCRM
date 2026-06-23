# Day Plan — metrics catalog

Calendar day: **Europe/Kyiv** (`kyivDayBounds` / `crm-timezone`).

Profiles: **office** (no `UserFieldProfile`) | **field** (`UserFieldProfile` exists).

## Office template (defaults)

| metricKey | Label | Plan | Weight | Fact semantics |
|-----------|-------|------|--------|----------------|
| `calls_outbound` | Вихідні дзвінки | 15 | 25% | `Call` where `managerUserId`, `direction=OUTBOUND`, `startedAt` in Kyiv day |
| `leads_new_processed` | Нові ліди оброблено | dynamic | 20% | Plan = `NEW` leads owned + `STATUS_CHANGED` events today; fact = events today |
| `tasks_due_today_done` | Задачі на сьогодні | dynamic | 20% | `Task` `assigneeId`, `dueAt` in Kyiv day; fact = `status=DONE` |
| `overdue_tasks_zero` | Прострочені задачі | 0 | 15% | `Task` OPEN/IN_PROGRESS, `dueAt < now`; 100% iff count = 0 |
| `work_queue_touches` | Касання з черги контактів | 5 | 10% | Distinct `contactId` on outbound `Call` per manager in day |
| `orders_created` | Створені замовлення | 1 | 10% | `Order` `ownerId`, `createdAt` in Kyiv day |

## Field template (defaults)

| metricKey | Label | Plan | Weight | Fact semantics |
|-----------|-------|------|--------|----------------|
| `visits_from_plan_done` | Візити за маршрутом | N stops | 35% | `RoutePlan` for UTC date; fact = stops with `visit.status=DONE` |
| `visits_total_done` | Завершені візити | 6 | 25% | `Visit` DONE, `startsAt` in Kyiv day |
| `field_shift_started` | Старт зміни | 1 | 15% | `FieldShift` for route UTC date |
| `tasks_due_today_done` | Задачі на сьогодні | dynamic | 15% | same as office |
| `calls_outbound` | Вихідні дзвінки | 5 | 10% | same as office |

## Scoring

- Target items: `percent = min(100, round(fact/plan*100))`; if `plan=0` → 100%.
- Zero-target items: 100% iff `fact=0`.
- Overall: weighted average of item percents.
- Status: green ≥80%, yellow ≥50%, red &lt;50%.

## Settings override

Optional `systemSetting.id = day_plan_templates`:

```json
{
  "office": { "items": [{ "key": "calls_outbound", "target": 20, "weight": 25 }] },
  "field": { "items": [{ "key": "visits_total_done", "target": 8 }] }
}
```

Partial overrides merge with defaults by `key`.

## API

- `GET /work/day-plan?date=YYYY-MM-DD&userId=` — full checklist (MANAGER self; LEAD/ADMIN team).
- `GET /dashboard/daily-team-activity` — adds `dayPlanPercent`, `dayPlanStatus` per row.
