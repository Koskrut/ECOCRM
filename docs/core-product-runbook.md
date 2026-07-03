# Core product runbook (operator)

## Deploy

- **Release-based deploy (основний шлях):** Git tag / workflow **Publish Registry Release** (`.github/workflows/publish-release.yml`) збирає й пушить образи, формує `deployment-manifest.json` і реєструє реліз у Control Plane. На стороні клієнта оновлення = підняти нові теги образів з того релізу (agent / compose / ваш процес).
- **Admin updater button (optional):** CRM can expose update status and "Update" action for ADMIN, but Docker operations must be executed by a host-side updater agent (`scripts/updater/agent.mjs`), not by backend container.
- **Міграції БД:** навіть при деплої тільки через реліз, схема оновлюється окремим кроком у вашому rollout (типово сервіс `backend-migrate` / one-shot `prisma migrate deploy` перед стартом `backend`). Нові таблиці/enum з релізу не застосуються лише від зміни тега образу без migrate.
- Run `crm-core-api` with `BACKEND_VARIANT=core` (Docker target `core-runner`).
- Run `crm-web` with `API_URL` pointing at the core API.

**Optional pre-release:** workflow **Preflight Release Build** — локальна збірка образів + `validate-deployment-manifest.mjs` + contract test без push; не заміняє publish-release, а зменшує ризик перед тегом.

## License & modules

- `license.json` / Control Plane controls **licensed** modules.
- **CP-only mode:** `enabled` is derived from licensed modules (no pilot toggles / no manual enabled overrides).
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
- CP update status contract: `GET /api/installations/:installationId/updates/status` with `{ latestVersion, targetVersion }` (see `docs/control-plane-update-contract.md`).

## Telegram (in-process на core)

- Модуль `int.integrations_telegram` доставляется **in-process** внутри `AppModuleCore`: webhook
  (`POST /integrations/telegram/webhook`), inbox `/conversations/*` и доставка кодов сброса пароля
  через `IntegrationPortsService.sendMessageToChat` работают на **core**. Отдельного
  `TELEGRAM_UPSTREAM_URL` / sidecar нет — прокси в `module-upstream-proxy.setup.ts` для Telegram не добавлять.
- `OUTBOUND_UPSTREAM_URL` влияет только на признак reachability Telegram в Control Plane UI
  (`module-state.service.ts`), а не на наличие роутов на core.
- Webhook помечен `@Public()` + `@SkipModuleGating()`: при выключенном модуле он отвечает `200 OK`,
  чтобы Telegram не уходил в retry-шторм; inbox/settings остаются под gating.
- Регистрация webhook: Settings → Telegram → «Register webhook» (`setWebhook` + `getWebhookInfo`).

## E2E / smoke

- Чеклист: `docs/e2e-core-smoke.md`.
- Telegram smoke: `docs/telegram-smoke.md`.
- Security / onboarding: `docs/security-compliance-baseline.md`, `docs/customer-success-onboarding.md`.

## UI smoke (core-only)

Перед релізом ядра пройти вручну на стенді з `BACKEND_VARIANT=core` і `license.json` без розширень:

- **Sidebar**: відображені тільки core-пункти (`Dashboard`, `Leads`, `Orders`, `Companies`, `Contacts`, `Tasks`, `Catalog`, для ADMIN — `Analytics`, `Settings`). Пункти `AI Calls`, `Прозвін`, `Visits`, `Inbox`, `Payments`, `Planning` — приховані.
- **Direct navigation** на `/outbound/campaigns`, `/visits`, `/work/calls`, `/inbox/telegram`, `/payments`, `/planning` і на gated settings маршрути (`/settings/fop`, `/settings/google-sheet`, `/settings/ringostat`, `/settings/outbound-voice`, `/settings/telegram`, `/settings/store`) показує екран `Module unavailable` (компонент `ModuleUnavailable`), а не порожнє "Not found" чи 500.
- **Settings → Extensions & integrations**: секція повністю порожня (всі картки приховано) або, при сбої `/system/modules`, замість списку показано банер "Стан модулів недоступний".
- **Module API failure**: при заблокованому `/system/modules` (наприклад, мережева помилка) Sidebar не показує жодного gated-пункту, всі gated-сторінки рендерять `ModuleUnavailable variant="api-error"` з кнопкою `Retry`.
- **Loading state**: при першому завантаженні Sidebar показує skeleton-полоски, а gated-layouts — компактний skeleton, без миготіння повного UI.
- **Мова**: у Sidebar / Settings немає змішаних RU+EN рядків — тільки EN base + UA-overrides з `apps/web/src/locales/uk.ts`.

При розширенні переліку gated-розділів додавати маршрут і у `apps/web/src/lib/modules/pathModuleGating.ts`, і у відповідний `layout.tsx` через `<ModuleSection moduleId={...}>`.
