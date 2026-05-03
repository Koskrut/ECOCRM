# Core product runbook (operator)

## Deploy

- **Release-based deploy (основний шлях):** Git tag / workflow **Publish Registry Release** (`.github/workflows/publish-release.yml`) збирає й пушить образи, формує `deployment-manifest.json` і реєструє реліз у Control Plane. На стороні клієнта оновлення = підняти нові теги образів з того релізу (agent / compose / ваш процес).
- **Міграції БД:** навіть при деплої тільки через реліз, схема оновлюється окремим кроком у вашому rollout (типово сервіс `backend-migrate` / one-shot `prisma migrate deploy` перед стартом `backend`). Нові таблиці/enum з релізу не застосуються лише від зміни тега образу без migrate.
- Run `crm-core-api` with `BACKEND_VARIANT=core` (Docker target `core-runner`).
- Run `crm-web` with `API_URL` pointing at the core API.

**Optional pre-release:** workflow **Preflight Release Build** — локальна збірка образів + `validate-deployment-manifest.mjs` + contract test без push; не заміняє publish-release, а зменшує ризик перед тегом.

## License & modules

- `license.json` / Control Plane controls **licensed** modules.
- Pilot toggles in **Settings → Pilot modules** control **enabled** extensions.
- With `MODULE_GATING_ENABLED=true`, HTTP routes without an effective module return **404** (by design).

## RBAC

- Default permission catalog: `POST /rbac/sync-defaults` (ADMIN).
- Custom roles: `POST /rbac/roles`, assign with `POST /rbac/users/:userId/roles`.
- Inspect effective permissions: `GET /rbac/users/:userId/effective`.

## Troubleshooting

- **403 on metadata pages**: user must be ADMIN for settings UI; API uses `PermissionsGuard` (`system.manage`, `custom_fields.manage`, etc.).
- **404 on integration settings**: module not licensed/enabled — expected in core-only.
- **Workflows not executing**: ensure rules are `isActive`, triggers match `record.created` / `record.updated`, and actions are allowed safe types.

## Control Plane phone-home

- Env: `CONTROL_PLANE_URL`, `CONTROL_PLANE_INSTALLATION_ID`, `CONTROL_PLANE_TOKEN` (або `CONTROL_PLANE_INSTALLATION_TOKEN`).
- Діагностика: `GET /system/control-plane` (ADMIN) і блок `controlPlane` на `/settings/health`.

## E2E / smoke

- Чеклист: `docs/e2e-core-smoke.md`.
- Security / onboarding: `docs/security-compliance-baseline.md`, `docs/customer-success-onboarding.md`.
