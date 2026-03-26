# Analytics — canonical docs

## Pages (web)

| Path | Purpose |
|------|---------|
| `/analytics/overview` | Executive KPIs, booked/collected trends, orders by stage, attention teaser |
| `/analytics/sales` | Sales KPIs, manager table, charts, risk panels |
| `/analytics/leads` | Lead creation, status/source, risk snapshot, tables |
| `/analytics/attention` | Operational backlog lists (tasks, stuck orders, leads, overdue orders) |
| `/analytics/managers` | Manager-level aggregates (also used by Sales) |
| `/analytics/finance` | Collected payments, debt snapshots, aging, top debtors |
| Other tabs | Clients, products, visits, operations, map — separate semantics |

## Semantics documents

- [Overview](./overview-semantics.md)
- [Sales](./sales-semantics.md)
- [Leads](./leads-semantics.md)
- [Finance](./finance-semantics.md)
- [Manual QA checklist](./qa-checklist.md)

## Access control (RBAC)

- **Routes:** `GET /analytics/*` is restricted to **ADMIN** and **LEAD** (see `analytics.controller.ts` `@Roles`).
- **Web:** `apps/web/src/app/analytics/layout.tsx` hides the whole analytics section for other roles (`/auth/me` → `role`).
- **Scope:**
  - **ADMIN:** all company data; optional `managerId` narrows to one manager.
  - **LEAD:** team scope via `AnalyticsScopeService` (`allowedOwnerIds`, `allowedAssigneeIds`); invalid `managerId` → 403.

### Leads: null owner

For **LEAD** (and similar), `buildLeadPeriodWhere` may include leads with `ownerId: null` so unassigned leads are visible to the team. Counts can include **unassigned** leads — not necessarily a data bug.

### Managers vs Sales

Both use the same `managerId` / team filters from the query string. **Managers** and **Sales** period semantics align for money metrics; **overdue tasks** on the managers table are a **snapshot**, not period revenue.

## Booked vs collected (once)

- **Booked revenue:** order economic amount (max(0, total − returns)) → USD, filtered by order **createdAt** in the selected period.
- **Collected payments:** **COMPLETED** payments → USD, filtered by **paidAt** in the period.

They are different events; never label one as the other or sum them into a single “revenue” without explicit definition.

## Proxy rule (once)

Any metric that is a **simplified or incomplete** stand-in for a business concept MUST be labeled **proxy** in UI and docs (e.g. WON share among leads created in period — not full funnel, not order conversion).

## Operational snapshot rule (once)

Counts/lists that describe **current backlog** (e.g. overdue tasks now, leads without recent activity now) are **snapshots**. They:

- Are **not** filtered by the analytics date range (except manager/team scope).
- Must **not** be implied to “compare” to a previous period in the API (`compare` payloads omit them where applicable).

## API contracts (backend)

Type-level documentation for JSON responses: `apps/backend/src/analytics/contracts/analytics-http.contracts.ts`.

**Period:** services use `Date` internally; HTTP JSON uses **ISO 8601 strings** for `period.from` / `period.to`.

## Main HTTP endpoints

| Method | Path | `period` | `compare` |
|--------|------|----------|-----------|
| GET | `/analytics/overview` | Yes | KPI only (`compare.kpi`) |
| GET | `/analytics/sales` | Yes | KPI only (no overdue snapshot) |
| GET | `/analytics/leads` | Yes | KPI + charts + tables (no `attention`) |
| GET | `/analytics/attention` | No (snapshot) | N/A |
| GET | `/analytics/managers` | Yes | No |
| GET | `/analytics/finance` | Yes | KPI: collected only (`compare.kpi` subset) |
| GET | `/analytics/clients` | Yes | No |
| GET | `/analytics/products` | Yes | No |
| GET | `/analytics/visits` | Yes | No |
| GET | `/analytics/operations` | Yes | No |
| GET | `/analytics/map` | Preset week/month | No |
| GET | `/analytics/drilldown` | Yes | No |

## Performance hotspots (sanity)

- **Exchange rates:** `SettingsService.getExchangeRates()` may run once per analytics service invocation; opening Sales loads **sales + managers** → two parallel requests, often **two** rate fetches. Acceptable for now; dedupe would need shared request-scoped cache.
- **Overview / Leads trends:** large `findMany` over period windows — see `PERF` comments in respective services.
- **Duplicate client fetches:** pages that call `useAnalyticsFetch` twice (e.g. Sales + managers) intentionally load two endpoints; no client-side dedupe unless added later.

## UI / query sync (web)

- **State:** `useAnalyticsFilters` in `apps/web/src/app/analytics/analytics-ui.tsx` — reads `dateFrom`, `dateTo`, `managerId`, `compare`, `preset` from URL; writes back with `router.replace` when local state changes.
- **Tabs:** `apps/web/src/app/analytics/layout.tsx` — each tab `Link` appends **current** `searchParams` so filters persist across pages.
