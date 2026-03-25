# Analytics — Verification Gate (Phase 0)

**Status:** Passed for MVP implementation (codebase review, 2026-03-24).

## Schema & fields

| Check | Result |
|-------|--------|
| `Order.completedAt` | **Absent.** Sales cycle / win rate remain conditional; not in MVP. |
| Terminal `orderStage` | Enum includes `COMPLETED`, `CANCELED`, `REFUSED`, `RETURN_IN_PROGRESS`. Booked revenue excludes **CANCELED, REFUSED** only (per plan). |
| `Payment.status = COMPLETED` for cash | **Yes** — use `paidAt` + `COMPLETED` for Collected Payments. |
| `Order.clientId` on commercial orders | **Nullable** — not guaranteed; client metrics must filter `clientId IS NOT NULL`. |
| `Activity.createdBy` | **Stores `user.id` (cuid)** — see `activities.service.ts` (`createdBy: user.id`). Safe for manager activity counts when implemented. |

## Attribution & scope

| Check | Result |
|-------|--------|
| `Order.ownerId` changes | Possible via `ordersService.update`; historical manager metrics can shift (caveat in UI). |
| `User.leadId` for team | **Present** on `User`; `teamMembers` relation. One-level hierarchy. Use for LEAD scope: `ownerId IN (team member ids)`. |
| `ProductWarehouseStock` freshness | Not verified against runtime sync; **inventory analytics deferred to Phase 3** with data-quality caveat. |
| `OrderStatusHistory` legacy coverage | **Unknown %** — stuck-order logic uses latest history row; fallback to `order.updatedAt` when no history. |

## Conditional metrics (post-MVP)

- Win rate, sales cycle, stage time — blocked until terminal semantics + history coverage validated.
- Exact lead→order conversion — requires `Lead.convertedOrderId` (Phase 3 migration).

**Phase 1 coding approved** after this document and `analytics-canon.md` are in repo.
