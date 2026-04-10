# Updater / Update Center — PR-1 approved scope

Status: **approved** (implementation-ready).  
Complements the blueprint: operator-driven updates, no docker-compose control from main backend, no update execution in PR-1, rollback-first procedure documented separately.

## API

- **Single endpoint:** `GET /system/release` only.
- Do **not** split into separate release vs update-status routes; include update visibility/policy fields in this response if needed.

## Source of truth (version / build metadata)

- **Backend only:** read from env (and/or build-injected metadata consumed at backend startup). Canonical variables:
  - `CRM_RELEASE_VERSION`
  - `GIT_SHA`
  - `BUILD_TIME`
  - `IMAGE_TAG` (optional)
- **Web:** no separate runtime source of truth for release info. The Next.js app loads this data **only** via the existing backend proxy pattern (same as other `/system/*` calls), not from its own env or build-time constants for product version.

## UI

- **Location:** small **read-only** block on the existing `apps/web/src/app/settings/page.tsx`.
- **No** dedicated settings subpage for updater in PR-1.
- **No** Update / Check buttons, **no** new navigation entry or sidebar surface.

## Out of scope (unchanged)

- Actual update execution, auto-update, backend invoking Docker Compose.
- Customer portal, billing, licensing edits, fleet management.
- Full “update platform” or preflight orchestration beyond minimal release visibility.

## Rollback

- Document operator rollback-first steps outside the app (image/tag revert, DB backup policy, Prisma migrate deploy considerations) — see **`docs/operator-update-runbook.md`**.
