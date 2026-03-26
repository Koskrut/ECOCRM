# Analytics Overview — semantics

Source of truth: `GET /analytics/overview` (`AnalyticsOverviewService`), not legacy `GET /dashboard/stats`.

## Page purpose

Cross-cutting KPIs: **booked** vs **collected**, orders, debt, lead creation and **WON share proxy**, plus trend charts and a teaser for operational attention.

## Booked vs collected (never mix)

| Concept | Meaning | Date field | Tables |
|--------|---------|------------|--------|
| **Booked revenue** | `max(0, totalAmount − returnAdjustmentAmount)` per order, converted to USD | Order **createdAt** (period filter) | `Order` + exchange rates |
| **Collected payments** | Completed payments in USD (`amountUsd` or converted `amount`) | Payment **paidAt** (period filter) | `Payment` + parent order scope |

They are different business events; do not sum or label them as one series.

## Period-based vs operational snapshot

- **KPI strip (except where noted) + charts:** scoped to the selected **date range**, **manager**, and **team (LEAD)** from `AnalyticsScope` — same query params as the request.
- **`debtTotal` and `overdueDebt` in KPI:** **operational snapshot** (current debt in scope), **not** filtered by the overview date range. The UI does **not** show period-over-period deltas for these two cards.
- **`data.attention` block:** **operational snapshot** (current backlog). Not filtered by the overview date range. Use `/analytics/attention` for row-level detail.

## Compare (`compare=prev_period`)

- Previous period = **same calendar length** immediately before `dateFrom` (`previousPeriodOfSameLength`).
- **Same scope** (manager/team) as the current period.
- **Response shape:** `compare` contains **only** `{ kpi }` — not charts and not `attention`. Those blocks are not meaningful as “previous period” analogues.
- **Avg check** compare: `compare.kpi.avgCheck` is `bookedRevenue / ordersCount` for that previous window — delta vs `data.kpi.avgCheck` is valid.

## Lead metric (proxy)

- API field: `leadConversionProxy`.
- **Canonical UI label:** **WON share (proxy)** — share of **WON** among **leads created in the period**. Not order conversion, not full funnel.

## Charts

- Time series: **current overview period only** (not overlay compare).
- UTC day buckets (`toISOString().slice(0, 10)`).

## Performance note

Overview loads all in-window orders (with `createdAt`) and payments for aggregates and day charts. See `PERF` comment in `analytics-overview.service.ts`. Heavy scale → consider SQL rollups / materialized aggregates (out of scope for current iteration).
