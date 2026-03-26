# Analytics Sales — semantics

Source: `GET /analytics/sales` (`AnalyticsSalesService`), manager table from `GET /analytics/managers`.

## Page purpose

Period-based sales KPIs and manager attribution, plus **current** operational signals (overdue tasks). Charts are **current period only** (no compare overlay).

## KPI list (`data.kpi`)

| Field | Semantics | Period vs snapshot |
|-------|-----------|-------------------|
| `bookedRevenue` | Sum of order economic amount → USD | **Period** (`createdAt`) |
| `collectedPayments` | Sum of completed payments → USD | **Period** (`paidAt`) |
| `ordersCount` | Orders in scope | **Period** |
| `avgCheck` | `bookedRevenue / ordersCount` | **Period** |
| `overdueTasksCount` | Tasks OPEN/IN_PROGRESS with `dueAt < now` | **Operational snapshot** |

## Compare (`compare=prev_period`)

- Previous window = same calendar length before `dateFrom` (`previousPeriodOfSameLength`).
- **`compare` includes only** `kpi.bookedRevenue`, `collectedPayments`, `ordersCount`, `avgCheck`.
- **`overdueTasksCount` is not returned on `compare`** — it is not a prior-period analogue.

## Charts / managers

- **By manager (chart):** booked revenue in **selected period** per manager (`GET /analytics/managers`).
- **Orders by stage:** counts for **selected period** only.
- **Overdue tasks column** on manager table: **snapshot** per assignee (same idea as overview tasks).

## Known limitations

- Exchange rates: loaded per request (see performance notes in code comments).
- Unowned orders: manager row naming falls back to id when owner relation missing.
