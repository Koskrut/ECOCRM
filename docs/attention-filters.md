# Attention list filters

Shared presets align **dashboard / inbox counts**, **analytics attention**, and **list API** filters so click-through shows the same rows as the tile count.

## Tasks

| Preset | Semantics | List URL |
|--------|-----------|----------|
| `attention=overdue` | `OPEN` / `IN_PROGRESS`, `dueAt` before start of today (Kyiv) | `/tasks?attention=overdue` |

Legacy alias: `/tasks?period=overdue` (UI maps to the same backend preset).

Plan drill-down: `/tasks?ids=id1,id2` (max 100).

Implementation: [`tasks-attention.util.ts`](../../apps/backend/src/tasks/tasks-attention.util.ts).

## Orders

| Preset | Semantics | List URL |
|--------|-----------|----------|
| `attention=overdue-payments` | Debt &gt; 0, `paymentDueDate` before today (Kyiv) | `/orders?attention=overdue-payments` |
| `attention=stuck` | Active stage, `createdAt` in period (default month), no stage move &gt; 3 days | `/orders?attention=stuck` |

Stuck list uses the same post-filter pipeline as analytics (candidate cap 600).

Plan drill-down: `/orders?ids=…`

Implementation: [`orders-attention.util.ts`](../../apps/backend/src/orders/orders-attention.util.ts).

## Leads

| Preset | Semantics |
|--------|-----------|
| `attention=without-touch` | NEW / IN_PROGRESS without recent activity (month) |
| `attention=never-contacted-new` | NEW, no activities |
| `attention=stale-in-progress` | IN_PROGRESS without recent activity |

See [`leads-attention.util.ts`](../../apps/backend/src/leads/leads-attention.util.ts).

## Visits (agenda)

No backend list preset — day page reads `?date=` and highlights `?ids=` client-side.

## Dashboard links

| Tile | Link |
|------|------|
| Прострочені завдання | `/tasks?attention=overdue` |
| Завислі угоди | `/orders?attention=stuck` |
| Ліди без дотику | `/leads?attention=without-touch` |
| Прострочені оплати | `/orders?attention=overdue-payments` |
