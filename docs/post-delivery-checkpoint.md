# Post-Delivery Checkpoint

Date: 2026-04-27

This checkpoint closes the current Track C runtime core + Track D delivery phase and defines the next decision point before starting another large track.

## Completed Scope

### Track A/B foundation

- Module registry and module gating are formalized around stable module ids.
- Dictionaries, custom fields, layouts, and RBAC foundation exist in the backend.
- Shared contracts and module SDK exist for module manifest/types.

### Track C runtime core

- Workflow trigger matcher, condition evaluator, execution logs, and guardrails are implemented.
- Internal actions are implemented: `update_field`, `assign_user`, `create_task`.
- Active assignee validation is in place via `User.isActive`.
- External actions are intentionally not implemented yet: email, Telegram, webhook.

### Track D delivery

- `v0.1.0` images were built and pushed to GHCR:
  - `ghcr.io/koskrut/crm-backend-core:0.1.0`
  - `ghcr.io/koskrut/crm-web:0.1.0`
  - `ghcr.io/koskrut/crm-store:0.1.0`
- `compose.base.yml` provides registry-based core delivery.
- `compose.modules.*.yml` provides module activation/config overlays for current in-process modules.
- `compose.client.yml` provides client-specific ports, URLs, license paths, and stable volumes.
- `README.md` documents deployment, update, rollback, migration from legacy compose, and the `0.1.x` compatibility window.

## Risks Now Visible

- First real client deploy is mostly a migration/readiness problem, not an image-build problem.
- `docker-compose.prod.yml` is still present as a deprecated compatibility path; it should not be removed until the registry stack is verified on the real server.
- Module overlays are config overlays only. They do not isolate runtime resources or code until Track E extracts module services.
- Workflow rate limits are in-memory and single-instance only. Multi-instance backend requires Redis-backed workflow guardrails.
- Workflow external actions need BullMQ/Redis and external provider retry/rate-limit policies.
- License server mode and file license mode both need real-environment verification before first paid production use.

## First-Client Deploy Blockers

Before the first working-client migration, complete a deploy-readiness pass:

1. Database backup and restore rehearsal.
2. `docker-compose.prod.yml` to registry stack migration rehearsal using a copy of production data.
3. Prisma migration dry-run on copied production DB.
4. `UserRole` to RBAC default mapping review.
5. Existing hardcoded business rules inventory:
   - keep product/security invariants in core;
   - convert client-configurable rules to workflow rules later.
6. Existing pseudo-custom fields inventory:
   - keep as core fields;
   - migrate to custom fields;
   - or mark as legacy readonly.
7. License file/server mode verification:
   - module entitlement check;
   - fail-closed behavior;
   - license cache behavior for server mode.
8. Module enabled state review:
   - `modules_enabled_v1` DB setting;
   - expected enabled module set per client bundle.
9. Reverse proxy and public URL verification:
   - CRM web;
   - store;
   - backend API;
   - Telegram/Ringostat/Bitrix webhook URLs if used.
10. Rollback plan:
    - image tag rollback;
    - PostgreSQL restore point;
    - expected downtime window.

## Recommended Next Priority

### 1. Migration path before first client deploy

This is the highest-value next step. It reduces deployment risk and validates the delivery work against real data.

Suggested commit scope:

- Add `docs/first-client-migration-checklist.md`.
- Define dry-run steps for a copied production DB.
- Define acceptance criteria for switching from `docker-compose.prod.yml` to registry compose.
- Define rollback and sign-off checklist.

### 2. Track C4 external workflow actions

Start only after deploy-readiness is clear. External actions add infrastructure complexity:

- BullMQ + Redis;
- async retries;
- per-provider rate limits;
- webhook timeout/retry policy;
- email/Telegram credential handling.

### 3. Frontend metadata-awareness

Do not start as the next immediate step unless a client requirement forces it. This is a larger product track and should follow a concrete first-client migration/readiness review.

## Decision

Pause automatic roadmap execution after Track D. Next implementation should be explicitly selected from:

- first-client migration checklist/readiness;
- Track C4 external workflow actions;
- a concrete client-driven frontend metadata feature.
