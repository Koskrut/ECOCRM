# Hardening Smoke Checklist

## Purpose
This smoke verifies that merged modularity and pipeline config changes are stable in real admin flows.
It checks only core manual paths for orders/leads pipeline updates, history behavior, access control, and deploy readiness.
It does not replace full regression, deep QA, or architecture validation.

## Preconditions
- `main` (or target deploy commit) is up to date.
- ADMIN account is available.
- Backend and web are running.
- `prisma migrate deploy` was already executed successfully.
- There are testable orders/leads records in the environment.

## Smoke checklist

### 1. Orders pipeline write
- **Action:** Open orders pipeline settings as ADMIN, change stage config (for example stage title/order), save.
- **Expected result:** Save succeeds, new config is visible after refresh, pipeline behavior stays consistent with runtime rules.

### 2. Leads pipeline write
- **Action:** Open leads pipeline settings as ADMIN, change step/stage config, save.
- **Expected result:** Save succeeds, new config is visible after refresh, derived runtime behavior remains valid.

### 3. History
- **Action:** Open history block/page for orders and leads after a real config change.
- **Expected result:** A new history entry appears with actor/time/summary and before/after snapshots.

### 4. No-op save
- **Action:** Open pipeline config and click save without any effective change.
- **Expected result:** Save returns success but does not create a new history row.

### 5. ADMIN access
- **Action:** Check write/history endpoints with ADMIN and non-ADMIN users.
- **Expected result:** ADMIN can read/write as expected; non-ADMIN is blocked for restricted operations.

## Deploy gate
- **Run:** `prisma migrate deploy`
- **Run:** start backend
- **Run:** start web
- **Expected result:** migrations complete cleanly, both apps boot without manual hotfixes, new pipeline/history tables are available immediately.

## Fast failure signals
- `prisma migrate deploy` fails or requires manual DB patching.
- backend/web fails to start after deploy.
- pipeline save fails (orders or leads).
- no-op save creates a history row.
- history endpoint/block fails or is inaccessible for ADMIN.
- restricted endpoints are accessible by non-ADMIN.

## Optional notes
- Manual page refresh after save is acceptable for smoke.
- No-op save must never append history.
- Runtime business rules must remain stricter than config flexibility.
