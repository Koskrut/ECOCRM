# Core product smoke checklist

Run against a `core-only` stack (`crm-core-api` + `crm-web` + Postgres) with `MODULE_GATING_ENABLED=true` for a strict check.

## Auth & roles

- [ ] Login as ADMIN, MANAGER, LEAD — each reaches the app shell.
- [ ] ADMIN opens **Settings → System health** (`/settings/health`) and sees `release`, `license-status`, `backend-variant`, `modules`.

## Module gating (web)

- [ ] With finance **not** effective: sidebar hides **Payments**; settings hides **ФОП**.
- [ ] With production planning **not** effective: sidebar hides **Planning**.
- [ ] With Telegram integration **not** effective: sidebar hides **Inbox**; settings hides **Telegram**.
- [ ] With Google Sheet **not** effective: settings hides **Google-таблиця**.

## Metadata (ADMIN)

- [ ] **Settings → Metadata & automation** opens hub.
- [ ] **Custom fields** page loads definitions (table).
- [ ] **Dictionaries**, **Layouts**, **Workflows**, **RBAC catalog**, **Custom entities** pages load without 401/403.

## Custom fields on record

- [ ] Open an existing **Contact** card → **Custom fields** section loads (or shows “no active fields”).
- [ ] MANAGER can save a TEXT custom field value (requires `metadata.write`).

## Data import

- [ ] **Settings → Data import**: run sample CSV with header `phone,first_name,last_name` — response shows `created` / `skipped`.

## Workflows

- [ ] Create/update a **Contact**, **Lead**, or **Order** with an active workflow rule — `WorkflowExecutionLog` rows appear (enforced mode).

## API (optional curl)

- [ ] `GET /system/backend-variant` (ADMIN JWT) returns `{ "variant": "core" }` on core image.
- [ ] `POST /data-import/contacts/csv` with body `{ "csvText": "..." }` (ADMIN + `system.manage`).
