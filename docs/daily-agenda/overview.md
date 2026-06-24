# Daily work agenda

Proactive **work plan for the day** (morning ritual): aggregate scheduled visits, tasks, and contact next actions; let the manager edit and confirm a plan; auto-close items from CRM facts; track completion %.

Distinct from [**Day Plan** (KPI norms)](../day-plan/metrics.md): agenda % = share of **your committed plan** completed; Day Plan % = activity vs **configured norms**.

## Calendar day

Europe/Kyiv (`kyivDayBounds`).

## Profiles

- **Office** — calls, tasks, contact next actions, work-queue suggestions
- **Field** — visits, route, MEETING without visit, backlog visits

## Resolution flow

1. `GET /work/daily-agenda` loads CRM **scheduled** (visits, tasks due today, contact `nextActionAt` today)
2. **`defaultProposal`** = all scheduled items (suggestions excluded)
3. Manager edits checklist → **draft** or **commit**
4. On each GET for a **COMMITTED** plan → **auto-complete** `PLANNED` items when CRM facts match
5. **`completion.percent`** = `doneCount / activeCount × 100` (excludes `DISMISSED`)

## Auto-complete rules

| kind | DONE when |
|------|-----------|
| VISIT | Visit `DONE` today |
| TASK | Task `DONE` |
| CONTACT_ACTION + CALL | outbound Call to contact today |
| CONTACT_ACTION + MEETING | Visit DONE for contact OR next action moved/changed |
| LEAD | lead no longer NEW / status changed today |
| SUGGESTION + contact | outbound Call to contact today |

## Data model

- `DailyWorkPlan` — `(userId, date)` unique, `DRAFT` | `COMMITTED`
- `DailyWorkPlanItem` — kind, source ids, status, position, `completedBy` `AUTO` | `MANUAL`

## API

| Method | Path |
|--------|------|
| GET | `/work/daily-agenda?date=YYYY-MM-DD` |
| POST | `/work/daily-agenda/draft` |
| POST | `/work/daily-agenda/commit` |
| PATCH | `/work/daily-agenda/items/:itemId` |

RBAC: MANAGER own plan only in v1; LEAD/ADMIN read own (team view later).

## UI

- Dashboard: `DailyAgendaWidget` + morning `MorningPlanModal` for MANAGER if not committed
- `/work/daily-agenda` — view / edit / re-commit

## UX

- Edit before commit: remove items, add from `availableSuggestions`, reorder
- «Пізніше» saves draft
- Re-commit during day: add items, dismiss `PLANNED`; `DONE` preserved
