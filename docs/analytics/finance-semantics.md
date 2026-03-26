# Analytics Finance — semantics

Source: `GET /analytics/finance` (`AnalyticsFinanceService`).

## Page purpose

Payment collection and debt visibility for **ADMIN / LEAD**: collected cash in the selected period, current debt and overdue exposure (snapshots), trends and drill-down tables.

**Not in scope:** booked revenue, cashflow forecasting, AI — do not mix with this page’s labels.

## KPI (`data.kpi`)

| Field | Semantics | Period vs snapshot |
|-------|-----------|-------------------|
| `collectedPayments` | Sum of **COMPLETED** payments → USD, `paidAt` in range, order in scope | **Period** |
| `paymentsCount` | Count of those payments | **Period** |
| `avgPaymentUsd` | `collectedPayments / paymentsCount` | **Period** |
| `debtTotal` | Sum of `debtAmount` on orders in scope (debt-eligible stages) | **Snapshot** |
| `overdueDebt` | Sum of debt on orders with `financialStatus === OVERDUE` | **Snapshot** |
| `overdueOrdersCount` | Count of orders OVERDUE with debt &gt; 0 | **Snapshot** |
| `customersWithOverdueCount` | Distinct `clientId` on those overdue orders | **Snapshot** |
| `pendingPaymentsCount` | `Payment` rows with `status === PENDING` linked to scoped orders | **Snapshot** |

Collected semantics match **Overview / Sales** `collectedPayments` (same `buildPaymentPeriodWhere` + USD conversion).

## Compare (`compare=prev_period`)

- Contains **only** `kpi.collectedPayments`, `kpi.paymentsCount`, `kpi.avgPaymentUsd` for the **previous** window of equal length.
- **No** debt/overdue/pending snapshot on `compare`.

## Charts (`data.charts`)

- **collectedPaymentsByDay:** current period only; UTC day from `paidAt`.
- **debtAgingBuckets:** snapshot — debt of orders with `paymentDueDate` in the past, bucketed by days overdue (0–7, 8–14, …).
- **paymentsBySourceType:** period — COMPLETED payments grouped by `sourceType` (BANK / CASH).

## Tables (`data.tables`)

- **topDebtors:** clients aggregated from orders with debt + due date (same basis as aging); snapshot.
- **overdueOrders:** up to 50 overdue orders, earliest `paymentDueDate` first; snapshot.

## Known limitations

- Single-tenant style scope (no explicit `companyId` in analytics filters) — same as other analytics endpoints.
- Pending payments: operational queue; not “uncollected revenue” in a strict sense.
- Heavy periods: full `findMany` of payments in window — see `PERF` comment in service.
