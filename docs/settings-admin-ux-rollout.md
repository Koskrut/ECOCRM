# Settings Admin UX Rollout Checklist

## Scope
- Settings information architecture updates.
- Access + RBAC unified management flow.
- User-friendly error handling in settings pages.
- Env-to-UI migration for mandatory operational settings.

## Pre-deploy checks
- Verify that `ADMIN` can open all settings groups and save changes.
- Verify that non-admin users cannot access admin-only settings pages.
- Verify guarded backend mutations for users:
  - `POST /users`
  - `PATCH /users/:id`
  - `PATCH /users/:id/role`
  - `DELETE /users/:id`
- Verify module-gated cards are hidden when module is not effective.

## Smoke test matrix

### Access and roles
- Open `Settings -> Access`.
- Change a user's legacy role and ensure update succeeds.
- Assign additional RBAC role and verify it appears in assigned roles.
- Remove assigned RBAC role and verify it disappears.
- Open effective permissions and verify list updates after changes.

### Settings hub navigation
- Validate grouped sections:
  - Access & team
  - Sales & processes
  - Integrations
  - System
  - Advanced
- Ensure each card opens the expected route.
- Ensure integration cards follow module effectiveness.

### Error handling
- Simulate API failure and verify UI shows user-friendly error copy.
- Ensure raw server internals are not displayed as primary UI message.

### Env-to-UI policy
- Confirm these values are read from UI-stored settings (DB), not runtime env:
  - Meta pixel id for public config
  - Telegram AI API key
  - Outbound voice public webhook base URL
- Confirm empty values are handled gracefully and reflected in UI.

## Rollout order (recommended)
1. Security guards for users mutations.
2. Settings hub IA changes.
3. Access + RBAC unified UI.
4. Error handling normalization.
5. Env-to-UI migration and docs update.

## Post-deploy monitoring
- Track 401/403 rates for settings endpoints.
- Track 4xx/5xx for `/rbac*`, `/users*`, `/settings*`.
- Verify no spike in support tickets for settings discoverability.
