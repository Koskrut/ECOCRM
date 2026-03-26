# Analytics — manual QA checklist

Use as a smoke test before wider rollout. Role: **ADMIN** or **LEAD** (MANAGER has no access to `/analytics`).

## Prerequisites

- Commands: `cd apps/backend && npx tsc --noEmit`
- Commands: `cd apps/web && npx tsc --noEmit`
- Run app locally; log in as ADMIN or LEAD.

## Shared filters & URL

- [ ] Change **date range** — URL updates (`dateFrom`, `dateTo`, `period=custom`).
- [ ] **Manager** dropdown — `managerId` in query when set.
- [ ] **Compare** checkbox — `compare=prev_period` when on; off when unchecked.
- [ ] **Tabs** — switch Overview → Sales → Leads → Attention → Managers; **query string is preserved** on each tab link.

---

## Overview (`/analytics/overview`)

- [ ] **Booked revenue** vs **Collected payments** — different subtitles; not mixed in tooltips.
- [ ] With **compare** on: deltas on booked, collected, orders, avg check, leads created, **WON share (proxy)**.
- [ ] **Debt total** / **Overdue debt** — **no** “vs попередній” line (operational snapshot).
- [ ] **WON share (proxy)** — title contains “proxy”; tooltip says not order conversion.
- [ ] Charts: data only for **current** period (no compare overlay).
- [ ] **Потребує уваги** — counts are snapshot; links to **Attention** with `#overdue-tasks`, `#stuck-orders`, `#leads-without-touch`, `#finance-overdue`.

---

## Sales (`/analytics/sales`)

- [ ] With compare: deltas on booked, collected, orders, avg check.
- [ ] **Current overdue tasks** — **no** delta row; tooltip mentions snapshot / not in API compare.
- [ ] Manager table: **Overdue tasks (snapshot)** column label.
- [ ] Charts: **current period** only.

---

## Leads (`/analytics/leads`)

- [ ] With compare: deltas on period KPIs (created, WON, WON share proxy, LOST, IN_PROGRESS, exact conversion if shown).
- [ ] **Ризики та увага** block — **no** deltas (snapshot).
- [ ] “OTHER (proxy…)” and similar labels where applicable.

---

## Attention (`/analytics/attention`)

- [ ] Banner: **operational snapshot**; compare in URL does **not** change lists.
- [ ] Sections load; anchors from Overview links scroll to correct section.

---

## Finance (`/analytics/finance`)

- [ ] **Collected payments / count / avg payment** — deltas only with **compare** (same semantics as Overview collected).
- [ ] **Debt / overdue / pending / customers with overdue** — **no** delta line.
- [ ] Charts: collected trend = period; aging buckets = snapshot; BANK/CASH = period.
- [ ] Tables: sortable top debtors; overdue orders list.
- [ ] Links to **Attention** (`#finance-overdue`, `#overdue-tasks`) preserve query string via layout tabs.

---

## Managers (`/analytics/managers`)

- [ ] Table shows booked / collected / orders / avg for **selected period** (same query as other pages).
- [ ] **Overdue tasks (snapshot)** — not period-based; compare checkbox does not call a compare API (documented on page).

---

## Compare: should vs should not

| Should show compare delta | Should NOT show compare delta |
|---------------------------|--------------------------------|
| Booked, collected, orders, avg check (where period-based) | Debt total, overdue debt (Overview KPI) |
| Leads created, WON counts, WON share proxy, etc. (Leads) | Current overdue tasks (Sales KPI) |
| | Attention counts / lists |
| | Operational risk block (Leads) |
| | Manager overdue column (snapshot) |

---

## Labels: proxy vs snapshot (not bugs)

- **Proxy:** WON share among leads in period — not full funnel; “exact” order link when column exists.
- **Snapshot:** overdue tasks, debt balances, attention lists, leads-without-touch style metrics — **not** filtered by analytics date range the same way as “created in period”.

## Known limitations (not bugs)

- **Exchange rates** may be fetched more than once when multiple analytics endpoints load in parallel (e.g. Sales + managers).
- **Large periods** may stress `findMany` for trend charts (Leads / Overview) — see backend PERF comments.
- **LEAD** scope is team-based; **null owner** leads may appear in scoped lists — see `buildLeadPeriodWhere` / docs.
