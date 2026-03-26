# Analytics Leads — semantics

Source: `GET /analytics/leads` (`AnalyticsLeadsService`).

## Page purpose

Lead pipeline metrics for the **selected period** (by lead `createdAt`), plus **operational** risk counts and summary tables.

## KPI list (`data.kpi`)

| Field | Semantics | Period vs snapshot |
|-------|-----------|-------------------|
| `leadsCreated` | Leads with `createdAt` in range | **Period** |
| `won` | Subset with `status === WON` | **Period** |
| `lost` | Subset with `status === LOST` | **Period** |
| `inProgress` | Subset with `status === IN_PROGRESS` | **Period** |
| `wonShareProxy` | `won / leadsCreated` (%) | **Proxy** — not order conversion |
| `exactConversionRate` | Leads with `convertedOrderId` / `leadsCreated` (if column present) | **Period** (when exposed) |
| `leadsWithConvertedOrder` | Count with `convertedOrderId` set | **Period** (when exposed) |

`convertedOrderId` is set on successful **`POST /leads/:id/convert`** when `createDeal` is true (first conversion order). It is **not** the same metric as `WON` / `wonShareProxy`.

## Charts (`data.charts`)

- **Leads created by day:** UTC day from `createdAt`, **current period only**.
- **By source / by status:** grouped in period.
- **Lost reasons:** `statusReason` for `LOST` only; empty → “(не вказано)” bucket.

## Tables (`data.tables`)

- Shares are **of leads created in the period** (denominator = `leadsCreated`).

## Attention (`data.attention`)

All **operational snapshots** (manager/team scope, not date range):

- `leadsWithoutTouchCount` — same definition as overview CRM count (Activity-based).
- `neverContactedNewLeadsCount` — `NEW` with no `Activity` rows ever.
- `staleInProgressLeadsCount` — IN_PROGRESS, old + no recent Activity (7d window).
- `leadsWithoutOwnerCount` — `ownerId` null.
- `leadsUnknownSourceProxyCount` — `source === OTHER` (**proxy** for unknown/default enum).
- `overdueLeadTasksCount` — overdue tasks with `leadId` set.

## Compare (`compare=prev_period`)

- Includes **kpi**, **charts**, **tables** for the previous period.
- **`attention` is omitted** on `compare` — snapshots are not shifted in time.

## Known limitations

- **No first-response metric** — not enough reliable timestamps.
- **No “qualified”** — no canonical enum.
- **Leads created by day** uses `findMany` of `createdAt` in window; large tenants may need SQL bucketing (see backend PERF comment).
