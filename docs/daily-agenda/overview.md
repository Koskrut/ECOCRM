# Daily work agenda

Proactive **work plan for the day** (morning ritual): aggregate scheduled visits, tasks, contact next actions, leads, orders, and call-queue signals; let the manager edit and confirm a plan; auto-close items from CRM facts; track completion %.

Distinct from [**Day Plan** (KPI norms)](../day-plan/metrics.md): agenda % = share of **your committed plan** completed; Day Plan % = activity vs **configured norms**.

## Calendar day

Europe/Kyiv (`kyivDayBounds`).

## Profiles

- **Office** — calls, tasks, contact next actions, work-queue, leads, overdue payments, call queue, missed inbound, debt control
- **Field** — visits, route backlog, MEETING without visit, overdue tasks

## Resolution flow

1. `GET /work/daily-agenda` loads CRM **scheduled** (visits, tasks due today, contact `nextActionAt` today)
2. Loads **recommendation sources**: overdue tasks, hot/new leads, overdue orders, call queue, debt contacts, missed calls (office), backlog visits (field)
3. **`defaultProposal`** = scheduled items + smart seed from top suggestions when plan is new
4. **`groupedSuggestions`** — recommendations by category (`scheduled`, `overdue`, `leads`, `orders`, `queue`, `route`, `calls`, `debt`)
5. Manager edits checklist → **draft** or **commit**
6. On each GET for a **COMMITTED** plan → **auto-complete** `PLANNED` items when CRM facts match
7. **`completion.percent`** = `doneCount / activeCount × 100` (excludes `DISMISSED`)

## Auto-complete rules

| kind | DONE when |
|------|-----------|
| VISIT | Visit `DONE` today |
| TASK | Task `DONE` |
| CONTACT_ACTION + CALL / CONTROL_PAYMENT | outbound Call to contact today |
| CONTACT_ACTION + MEETING | Visit DONE for contact OR next action moved/changed |
| LEAD | lead no longer NEW / status changed today |
| SUGGESTION + contact | outbound Call to contact today |
| SUGGESTION + orderId | payment recorded on order today |

## Data model

- `DailyWorkPlan` — `(userId, date)` unique, `DRAFT` | `COMMITTED`
- `DailyWorkPlanItem` — kind, source ids, status, position, `metadata` (entity snapshot, href, category), `completedBy` `AUTO` | `MANUAL`

## API

| Method | Path |
|--------|------|
| GET | `/work/daily-agenda?date=YYYY-MM-DD` |
| POST | `/work/daily-agenda/draft` |
| POST | `/work/daily-agenda/commit` |
| PATCH | `/work/daily-agenda/items/:itemId` |

Response includes `summary`, `groupedSuggestions`, enriched `metadata.entitySnapshot` on items.

RBAC: MANAGER own plan only in v1; LEAD/ADMIN read own (team view later).

## UI

- Dashboard: `DailyAgendaWidget` + morning `MorningPlanModal` for MANAGER if not committed
- `/work/daily-agenda` — split layout: plan + profile sidebar + grouped recommendations
- Rich `AgendaItemCard` with entity links, kind badges, priority score
- Committed view: active / done sections, dismiss + mark done

## UX

- Edit before commit: remove items, add from grouped recommendations (bulk «Додати всі»), reorder
- «Пізніше» saves draft
- Re-commit during day: add items, dismiss `PLANNED`; `DONE` preserved
- Smart default: empty morning no longer shows «0 пунктів» when inbox has signals

## Click-through (summary strip)

Summary tiles link to list pages with the **same entity set** as the plan:

| Tile | URL pattern |
|------|-------------|
| Visits | `/visits?date=YYYY-MM-DD&ids=…` (highlights on day map) |
| Tasks | `/tasks?ids=…` or `/tasks?attention=overdue` |
| Leads (office) | `/leads?ids=…` or `/leads?attention=without-touch` |
| Orders | `/orders?ids=…` or `/orders?attention=overdue-payments` |
| Calls | `/work/calls/queue` |

See [Attention list filters](../attention-filters.md) for dashboard/inbox presets.
