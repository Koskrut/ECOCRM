# Analytics metric canon — ECOCRM

Frozen definitions for the Analytics module. Align UI labels and API field names with this document.

## Money & orders

### Booked Revenue
- **Meaning:** Value of orders booked in the period (accrual by order creation).
- **Formula:** `SUM(GREATEST(0, totalAmount - returnAdjustmentAmount))` over orders with `createdAt` in `[dateFrom, dateTo]`.
- **Exclude:** `orderStage IN (CANCELED, REFUSED)`.
- **Date dimension:** `Order.createdAt`.

### Collected Payments
- **Meaning:** Cash/collected amount by payment date.
- **Formula:** `SUM(Payment.amount)` where `status = COMPLETED` and `paidAt` in period.
- **Date dimension:** `Payment.paidAt`.
- **Never** mix with Booked Revenue in one KPI tile.

### Debt (snapshot)
- **Formula:** `SUM(Order.debtAmount)` for orders **not** in `CANCELED, REFUSED`.
- **No period filter** — as-of query time.

### Overdue Debt (snapshot)
- **Formula:** `SUM(Order.debtAmount)` where `financialStatus = OVERDUE` (and same exclusions as Debt).

### Orders count
- **Meaning:** Orders created in period.
- **Filter:** `createdAt` in period, exclude `CANCELED, REFUSED`.

### Avg check
- **Formula:** `Booked Revenue / Orders count` (same period, same exclusions).

## Leads

### Lead conversion (proxy) / WON rate
- **Formula:** `COUNT(status = WON) / COUNT(*)` for leads with `createdAt` in period.
- **Exclude from denominator (optional UI):** `SPAM` — product decision; default include all unless specified.
- **Label:** "WON rate" / "Кваліфікація лідів" — **not** "конверсія в продаж".

### Exact lead-to-order conversion
- **Requires:** `Lead.convertedOrderId` populated (Phase 3+).

## Operational

### Overdue task
- `dueAt < now`, `status IN (OPEN, IN_PROGRESS)`, `dueAt IS NOT NULL`.

### Stuck order
- Non-terminal stage; last stage transition (or `updatedAt` if no `OrderStatusHistory`) older than threshold (default 3 days).
- Terminal stages for stuck exclusion: `CANCELED`, `REFUSED`, `COMPLETED`.

### Leads without touch (attention)
- **NEW:** created > 3 days ago and no `Activity` on lead in last 3 days.
- **IN_PROGRESS:** created > 7 days ago and no `Activity` on lead in last 7 days.

## RBAC scope field

- Order-scoped metrics: filter by `Order.ownerId` before aggregate.
- Lead-scoped: `Lead.ownerId` (and unassigned rules as in `LeadsService` for MANAGER — analytics mirrors list access).
- Payment joins through `Order` for owner scope.

## AR aging (Phase 2+)

- Bucket by `today - paymentDueDate` where `debtAmount > 0` and `paymentDueDate` set: 0–7, 8–14, 15–30, 31–60, 60+.
