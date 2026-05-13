# Settings Smoke Checklist (Staging/Prod)

## Quick run format
- Test users: `ADMIN`, `LEAD`, `MANAGER`, `USER`.
- Browser: clean session per role (or separate profiles).
- Goal: verify access boundaries, key saves, and user-facing copy consistency.

## 1) ADMIN
- Open `Settings` and verify grouped sections render:
  - `Доступ і команда`
  - `Продажі та процеси`
  - `Інтеграції`
  - `Система`
  - `Розширені`
- Open `Settings -> Access`:
  - change legacy role for one test user;
  - assign extra RBAC role;
  - remove extra RBAC role;
  - confirm effective permissions update.
- Open integration settings (`Ringostat`, `Outbound voice`, `Telegram`, `Google Sheet`, `Google Maps`, `Store`) and verify:
  - page loads without raw backend errors;
  - save action works;
  - secret fields remain masked after save.
- Open `Settings -> Health`:
  - status refresh works;
  - preflight/apply actions are visible for admin.

## 2) LEAD
- Open `Settings`:
  - admin-only cards must be hidden.
- Try direct URL access to admin pages:
  - `/settings/access`
  - `/settings/health`
  - `/settings/metadata/rbac`
  - expect `403` or guarded denial UI.
- Verify no ability to mutate users/roles via UI.

## 3) MANAGER
- Same checks as `LEAD` for admin-only sections.
- Confirm only allowed settings areas are visible.
- Confirm direct URL access to admin pages is denied.

## 4) USER
- Open `Settings` and verify only non-admin safe items are visible.
- Confirm direct URL access to admin pages is denied.
- Confirm no write operations for access/roles are possible.

## 5) API security spot-check (recommended)
- Verify protected user mutation endpoints reject non-admin roles:
  - `POST /users`
  - `PATCH /users/:id`
  - `PATCH /users/:id/role`
  - `DELETE /users/:id`
- Expected: `403` for non-admin / no required permission.

## 6) UX text consistency spot-check
- On key pages (`Settings`, `Access`, `Ringostat`, `Outbound voice`, `Health`, `FOP`):
  - no mixed RU/EN/UA in primary headings/buttons;
  - status and error messages are user-friendly (not raw internals).

## 7) Pass criteria
- Access boundaries are correct for all four roles.
- Admin flows save successfully.
- No critical regressions in settings navigation.
- No raw technical errors displayed as primary user message.
