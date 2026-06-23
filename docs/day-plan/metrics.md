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
- Overall: weighted average of item percents (enabled items only).
- Status thresholds (defaults): green ≥80%, yellow ≥50%, red &lt;50%. Configurable globally and per user.

## Resolution chain

For each `userId` the effective template is built in order:

1. **Defaults** — `DEFAULT_OFFICE` / `DEFAULT_FIELD` in code.
2. **Global overrides** — `SystemSetting.id = day_plan_templates` (office/field partial item overrides + optional `thresholds`).
3. **User profile** — office vs field from `UserFieldProfile` (not editable in day-plan settings).
4. **User override** — `UserDayPlanOverride` row (optional partial items + optional thresholds).
5. **Filter** — drop items with `enabled: false`.

```
defaults → global[profile] → userOverride → filterEnabled → DayPlanService
```

If no `UserDayPlanOverride` exists, step 4 is skipped.

### Editable plan targets

| metricKey | Editable plan |
|-----------|---------------|
| `calls_outbound`, `work_queue_touches`, `orders_created`, `visits_total_done`, `field_shift_started` | yes |
| `leads_new_processed`, `tasks_due_today_done`, `visits_from_plan_done` | no (dynamic) |
| `overdue_tasks_zero` | no (always 0) |

Enabled item weights must sum to **100**.

## Data model

### Global (`day_plan_templates`)

```json
{
  "thresholds": { "green": 80, "yellow": 50 },
  "office": { "items": [{ "key": "calls_outbound", "target": 20, "weight": 25, "enabled": true }] },
  "field": { "items": [{ "key": "visits_total_done", "target": 8 }] }
}
```

Partial overrides merge with defaults by `key`.

### Per user (`UserDayPlanOverride`)

| column | type | notes |
|--------|------|-------|
| `userId` | PK | cascade delete with `User` |
| `items` | JSON | partial overrides: `{ key, target?, weight?, enabled?, label? }[]` |
| `thresholds` | JSON? | optional `{ green, yellow }` |
| `updatedById` | FK? | who last changed |

## API

### Work (execution)

- `GET /work/day-plan?date=YYYY-MM-DD&userId=` — full checklist (MANAGER self; LEAD/ADMIN team).
- `GET /dashboard/daily-team-activity` — adds `dayPlanPercent`, `dayPlanStatus` per row.

### Settings

| Method | Path | Who can write |
|--------|------|---------------|
| GET | `/settings/day-plan` | ADMIN, LEAD (read) |
| PATCH | `/settings/day-plan` | ADMIN |
| GET | `/settings/day-plan/users/:userId` | ADMIN, LEAD (team) |
| PATCH | `/settings/day-plan/users/:userId` | ADMIN, LEAD (team) |
| DELETE | `/settings/day-plan/users/:userId` | ADMIN, LEAD (team) — reset override |
| GET | `/settings/day-plan/users-with-overrides` | ADMIN, LEAD |

LEAD may only access users where `user.leadId === actor.id` (plus self where applicable).

## UI

- **Settings → Day plan** (`/settings/day-plan`): global office/field templates (ADMIN) + per-employee overrides (ADMIN / LEAD for team).
- **Employee card** (`EmployeeModal`): «План на день» section for ADMIN/LEAD.
- **Employees list**: badge when user has a custom override.
- **Work** (`/work/day-plan`): read-only checklist for the current user.
