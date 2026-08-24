# Матрица модулей CRM (production)

> Синхронизировано с релизом **`v0.2.165`** (order line promos + 1C payments + settings hub): NP **IntegrationSetting** + UI **`/settings/nova-poshta`**; Google Drive в **Settings → Google-таблиця**; companies create (name-only, auto owner); rewrite путей прокси NP → upstream.

Документ фиксирует **фактическое** состояние репозитория: реестр (`module-registry.ts`), варианты `BACKEND_VARIANT`, Docker, compose, reverse-proxy на sidecar, health-пробы, UI настроек и cron. Для лицензирования и CP см. `ModuleManifestV1` в `@crm/contracts`; поле `delivery` в манифесте описывает **продуктовый** тип, а не каждый способ деплоя — при необходимости sidecar переменные `*_UPSTREAM_URL` документированы ниже (см. также комментарии `// RU:` в `apps/backend/src/modules/module-registry.ts`).

Связанные документы:

- [Nova Poshta (prod)](np-module-prod.md)
- [Внутренняя авторизация core ↔ module](module-internal-auth.md)

---

## Сводка по `compose.modules*.yml`

| Файл | Назначение |
|------|------------|
| `compose.modules.integrations.yml` | Включение gating и env для интеграций (Telegram-бот, NP env fallback, Google и т.д.); **без** отдельных Nest sidecar для Telegram. |
| `compose.modules.outbound.yml` | Env для AI outbound / голоса в монолите. |
| `compose.modules.outbound-sidecar.yml` | `backend-outbound` (`outbound_worker`), на `backend`: `OUTBOUND_UPSTREAM_URL`, `OUTBOUND_CRON_DISABLED`. |
| `compose.modules.np.yml` / `compose.modules.np-sidecar.yml` | `NP_UPSTREAM_URL`; sidecar: `np_worker`, `NP_CRON_DISABLED`, `NP_WRITES_DISABLED` на core. |
| `compose.modules.google-sheet-sidecar.yml` | `GOOGLE_SHEET_UPSTREAM_URL`, `google_sheet_worker`. |
| `compose.modules.bitrix.yml` / `compose.modules.bitrix-sidecar.yml` | `BITRIX_UPSTREAM_URL`, `BITRIX_CRON_DISABLED`; sidecar: `bitrix_worker`, `BITRIX_SYNC_ENABLED`, `BITRIX_WEBHOOK_ENABLED`, `CRON_ENABLED`. |
| `compose.modules.finance.yml` / `compose.modules.finance-sidecar.yml` | `FINANCE_UPSTREAM_URL`, `FINANCE_CRON_DISABLED`; sidecar `finance_worker`. |
| `compose.modules.planning.yml` / `compose.modules.planning-sidecar.yml` | `PLANNING_UPSTREAM_URL`, `PLANNING_CRON_DISABLED`; sidecar `planning_worker`. |
| `compose.modules.ringostat.yml` / `compose.modules.ringostat-sidecar.yml` | `RINGOSTAT_UPSTREAM_URL`, `RINGOSTAT_CRON_DISABLED`; sidecar `ringostat_worker`. |
| `compose.modules.store.yml` | Образ **Next.js** `crm-store` (публичный магазин), не Nest-модуль. |
| `compose.modules.production-planning.yml` | Только `MODULE_GATING_ENABLED` для планирования. |

---

## Индекс переменных окружения (модули)

| Переменная | Роль |
|------------|------|
| `OUTBOUND_UPSTREAM_URL` | Прокси с core на `outbound_worker`; health в `ModuleHealthService` для `ext.manual_calling` и `ext.voice_outbound` (один URL). |
| `FINANCE_UPSTREAM_URL` | Прокси `/payments`, `/bank`, `/payment-requests`, `/public/payment-requests`, regex заказов. |
| `PLANNING_UPSTREAM_URL` | Прокси `/planning`. |
| `NP_UPSTREAM_URL` | Прокси `/np`, `/store/np`, regex TTN под заказы/отгрузки (+ path rewrite). |
| `GOOGLE_SHEET_UPSTREAM_URL` | Прокси `/integrations/google-sheet`, regex `send-to-sheet`, `/settings/google-sheet`. |
| `BITRIX_UPSTREAM_URL` | Прокси `/integrations/bitrix`. |
| `RINGOSTAT_UPSTREAM_URL` | Regex `/integrations/ringostat`, `/settings/ringostat`. |
| `MODULE_INTERNAL_SECRET` | Заголовок `x-crm-module-internal` при проксировании (см. [module-internal-auth.md](module-internal-auth.md)). |
| `MODULE_HEALTH_TTL_MS` | Интервал опроса upstream `GET {base}/system/version` (по умолчанию 30s, минимум 5s). |
| `*_MODULE_IMAGE_NAME` | Имя образа GHCR для sidecar (`OUTBOUND_MODULE_IMAGE_NAME`, `NP_MODULE_IMAGE_NAME`, …). |
| `OUTBOUND_CRON_DISABLED`, `FINANCE_CRON_DISABLED`, `NP_CRON_DISABLED`, `PLANNING_CRON_DISABLED`, `BITRIX_CRON_DISABLED`, `RINGOSTAT_CRON_DISABLED` | Отключить соответствующие cron на **этом** процессе (обычно core при вынесенном worker). |
| `CRON_ENABLED` | Глобальный флаг для модульных cron (см. матрицу ниже); системный phone-home Control Plane на него не завязан. |

**Удалено из кода:** `TELEGRAM_UPSTREAM_URL` — отдельного Telegram sidecar в репозитории нет; Telegram только in-process.

---

## Матрица по модулям (`MODULE_REGISTRY`)

Пояснения к колонкам:

- **CP**: `entitlementKey` = `id`, `bundleSelectable`.
- **Runtime**: `full` / `core` + опциональные upstream; либо `*_worker`.
- **Health**: при заданном `MODULE_UPSTREAM_ENV` для модуля — опрос `{UPSTREAM}/system/version` (кэш TTL `MODULE_HEALTH_TTL_MS`).
- **Прокси**: `apps/backend/src/proxy/module-upstream-proxy.setup.ts` — `MODULE_UPSTREAM_STATIC_MOUNTS` + `MODULE_UPSTREAM_REGEX_MOUNTS`.

| id | kind | dependsOn | CP bundleSelectable | registry delivery | Фактический runtime | Dockerfile / main | Compose (фрагмент) | Upstream env | Прокси (кратко) | Health | Ключевые backend-префиксы | Представительные web `/api/*` | Settings / gating | Cron / флаги | Конфиг (модель) | Риски prod |
|----|------|------------|---------------------|-------------------|---------------------|-------------------|---------------------|--------------|----------------|--------|---------------------------|--------------------------------|-------------------|--------------|-----------------|------------|
| `core.crm` | core | — | false | in_process | Всегда в процессе full/core | `runner` / `core-runner` → `core-main.ts` | базовый compose | — | — | всегда ok | `/auth`, `/system`, `/settings`, сущности CRM | `/api/auth/*`, `/api/system/*`, … | карточки без gate или core | зависит от подсистем | env + Settings DB | Разрастание монолита. |
| `ext.visits` | extension | core | true | in_process | in-process | — (в `runner`) | — | — | — | — | `/visits`, route-plans… | `/api/visits/*`, route-plans | `/visits` sidebar gate | нет выделенного `*_CRON` в grep | Settings / сущности | — |
| `ext.manual_calling` | extension | core | true | external_service | in-process **или** `outbound_worker` при `OUTBOUND_UPSTREAM_URL` | `outbound-runner` / `outbound-main.ts` | `compose.modules.outbound-sidecar.yml` | `OUTBOUND_UPSTREAM_URL` | `/manual-calling`, `/calls`, … | shared с outbound | `/manual-calling`, `/calls` | `/api/manual-calling/*`, `/api/calls/*` | нет отдельной карточки в списке (см. outbound) | `OUTBOUND_CRON_DISABLED` + `CRON_ENABLED` для оркестратора на core | env + CRM | Double cron если не выставить `OUTBOUND_CRON_DISABLED` на core. |
| `ext.voice_outbound` | extension | core | false | external_service | in-process **или** `outbound_worker` | как выше | как выше | как выше | `/outbound`, `/integrations/outbound-voice` | как выше | `/outbound`, webhooks | `/api/outbound/*`, `/api/integrations/outbound-voice` | `/settings/outbound-voice` | `OutboundOrchestratorCron` | env / Settings | Legacy лицензия тянет Ringostat; webhook секреты. |
| `ext.finance` | extension | core | true | in_process | in-process **или** `finance_worker` | `finance-runner` / `finance-main.ts` | `compose.modules.finance-sidecar.yml` | `FINANCE_UPSTREAM_URL` | static + regex orders | да | `/payments`, `/bank`, … | `/api/payments/*`, `/api/bank/*` | `/settings/fop` | `FINANCE_CRON_DISABLED`, `CRON_ENABLED`, `BankSyncCron` | Settings DB + bank | Двойной bank sync. |
| `ext.production_planning` | extension | core | true | in_process | in-process **или** `planning_worker` | `planning-runner` / `planning-main.ts` | `compose.modules.planning-sidecar.yml` | `PLANNING_UPSTREAM_URL` | `/planning` | да | `/planning/*` | `/api/planning/*` | нет отдельной карточки в `settings/page` (функции в planning) | `PLANNING_CRON_DISABLED`, `CRON_ENABLED` (расписание `WeeklyPlanningJob`), ручной `POST .../jobs/weekly-plan/run` — без `CRON_ENABLED` | DB + env | — |
| `ext.risk_management` | extension | core | true | in_process | in-process (`AppModuleCore`) | — | — | — | — | да | `/risk/*` | `/api/risk/*` | sidebar `/risk` | `RiskCron` nightly 02:00 Kyiv; no-op when module not effective | DB + license | Soft degrade without Finance module. |
| `ext.store` | extension | core | true | in_process | Backend store APIs in-process; **витрина** = образ `crm-store` | — | `compose.modules.store.yml` | — | — | — | store-related controllers | `/api/settings/store`, products | `/settings/store` | нет `STORE_CRON_DISABLED` в коде | Settings + env | Версия `STORE_VERSION` отдельно от backend. |
| `int.integrations_telegram` | integration | core | true | in_process | **Только in-process** | нет `telegram-main` / runner | нет telegram compose | *(нет в `MODULE_UPSTREAM_ENV`)* | нет | нет отдельного upstream | `/integrations/telegram`, `/conversations` | `/api/settings/telegram`, `/api/conversations/*`, `/api/auth/telegram-*` | `/settings/telegram`, inbox sidebar | нет `TELEGRAM_CRON_DISABLED` | env секреты бота + Settings | Раньше в коде был «фантом» upstream — убран. |
| `int.nova_poshta` | integration | core | true | in_process | in-process **или** `np_worker` | `np-runner` / `np-main.ts` | `compose.modules.np-sidecar.yml` | `NP_UPSTREAM_URL` | `/np`, `/store/np`, regex TTN | да | `/np`, `/store/np`, orders TTN | `/api/np/*`, orders np routes | `/settings/nova-poshta` | `NP_CRON_DISABLED`, `CRON_ENABLED` (`NpSyncCron`, `NpTtnCron`) | Settings DB + env fallback | `NP_WRITES_DISABLED` на core при sidecar; см. [np-module-prod.md](np-module-prod.md). |
| `int.google_sheet` | integration | core | true | in_process | in-process **или** `google_sheet_worker` | `google-sheet-runner` / `google-sheet-main.ts` | `compose.modules.google-sheet-sidecar.yml` | `GOOGLE_SHEET_UPSTREAM_URL` | static + regex | да | `/integrations/google-sheet` | `/api/settings/google-sheet`, orders send-to-sheet | `/settings/google-sheet` | нет dedicated cron в grep | env Google | — |
| `int.bitrix` | integration | core | true | in_process | in-process **или** `bitrix_worker` | `bitrix-runner` / `bitrix-main.ts` | `compose.modules.bitrix-sidecar.yml` | `BITRIX_UPSTREAM_URL` | `/integrations/bitrix` | да | `/integrations/bitrix` | data-import и др. | read-only / env (нет карточки Bitrix на settings home) | `BITRIX_CRON_DISABLED`, `CRON_ENABLED` (delta + webhook retry), `BITRIX_SYNC_ENABLED`, `BITRIX_WEBHOOK_ENABLED` | env + скрипты | Двойной sync при неверных флагах. |
| `int.ringostat` | integration | core | true | in_process | in-process **или** `ringostat_worker` | `ringostat-runner` / `ringostat-main.ts` | `compose.modules.ringostat-sidecar.yml` | `RINGOSTAT_UPSTREAM_URL` | regex only | да | `/integrations/ringostat` | `/api/settings/ringostat/*` | `/settings/ringostat` | `RINGOSTAT_CRON_DISABLED`, `CRON_ENABLED` | env | Polling нагрузка. |

**Gating (web):** `apps/web/src/lib/modules/pathModuleGating.ts` — `sidebarHrefModuleId`, `settingsHrefModuleId`; карточки на `apps/web/src/app/settings/page.tsx` фильтруются через `useModules` / `moduleEffective`.

---

## Модель конфигурации по модулям

Источники: `apps/backend/src/settings/settings.controller.ts`, `settings.service.ts` (ключи `SystemSetting`, провайдеры `IntegrationSetting`), `apps/backend/src/integrations/ringostat/ringostat-settings.controller.ts`, доменные сервисы (`bank-accounts.service.ts`, `demand-rules.service.ts`), env в cron/worker (`process.env.*` в соответствующих модулях).

**Типы хранилища:**

- **SystemSetting** — строка `id`, JSON `value` (Prisma `SystemSetting`).
- **IntegrationSetting** — строка `provider`, JSON `config`, опционально `apiToken` / `webhookSecret` (см. `SettingsService`).

| Модуль (`id`) | Settings DB | Env / vault only | Read-only / ops |
|---------------|-------------|------------------|-----------------|
| `core.crm` | **SystemSetting:** `exchange_rates`, `meta_lead_ads`, `google_maps`, `org_chart_structure` и др. платформенные ключи из `SettingsService` / контроллера `settings` (не привязаны к optional module id). | Инфраструктура: `DATABASE_URL`, секреты JWT/auth, URL публичного API, версии образов, `BACKEND_VARIANT`, `MODULE_GATING_ENABLED` и т.д. | `/settings/health` → `/system/release`, `/system/license-status`, `/system/backend-variant`, `/system/modules`, CP/update; маршруты `/system/version` для живости. |
| `ext.visits` | Нет отдельного блока в `SettingsController`; данные визитов — сущности БД / доменные таблицы. | **Чисто in-process:** отдельных `*_UPSTREAM_URL` / секретов модуля в репозитории нет. | Gating в UI (`pathModuleGating`); проверка маршрутов `/visits`, `/api/visits/*` при включённой лицензии. |
| `ext.manual_calling` | Общий стек с outbound: отдельной формы manual calling в `settings.controller` нет; очередь/история — через API `/manual-calling`, `/calls`. | `OUTBOUND_UPSTREAM_URL`, `OUTBOUND_CRON_DISABLED`, `CRON_ENABLED`, `OUTBOUND_MODULE_IMAGE_NAME`, `MODULE_INTERNAL_SECRET` (заголовок прокси), таймауты/батчи оркестратора при необходимости. | `ModuleHealthService`: при заданном `OUTBOUND_UPSTREAM_URL` — опрос `{upstream}/system/version` (кэш TTL `MODULE_HEALTH_TTL_MS`); в health UI — блок модулей из `/system/modules`. |
| `ext.voice_outbound` | **IntegrationSetting** `provider = OUTBOUND_VOICE` (`OUTBOUND_VOICE_PROVIDER`): `OutboundVoiceIntegrationConfig` (URL провайдера, пути, `runtimeMode`, defaults и т.д.); секреты — поля `apiToken` / `webhookSecret` в строке интеграции + PATCH через `PATCH /settings/outbound-voice`. Fallback webhook: `OUTBOUND_VOICE_WEBHOOK_SECRET` в env (`outbound-voice-webhook.service.ts`). | Как у manual calling: `OUTBOUND_UPSTREAM_URL`, cron-флаги; доп.: `OUTBOUND_VOICE_STUB_AUTO_COMPLETE`, `OUTBOUND_CATALOG_PUBLIC_URL`, `OUTBOUND_LINK_RECONCILE_*`, `OUTBOUND_CALL_LINK_WINDOW_MINUTES` и др. из outbound-кода. | Smoke: `/settings/outbound-voice`, webhooks `/integrations/outbound-voice/webhook`; upstream health как выше. |
| `ext.finance` | **Prisma `BankAccount`** (реквизиты, `credentials`); **SystemSetting:** `bankAccountVisibilityByUser`, `userDefaultBankAccountId`, `storeDefaultBankAccountId` (`bank-accounts.service.ts`). UI: `/settings/fop` → `/bank/accounts*`. | `FINANCE_UPSTREAM_URL`, `FINANCE_CRON_DISABLED`, `CRON_ENABLED`, `FINANCE_MODULE_IMAGE_NAME`, `STORE_DEFAULT_BANK_ACCOUNT_ID` (fallback для магазину, если нет SystemSetting). | Bank sync cron под флагами; health по `FINANCE_UPSTREAM_URL`. |
| `ext.production_planning` | **SystemSetting** `planning_demand_rules_v1` (`DemandRulesService`). Остальное (BOM, партии и т.д.) — доменные таблицы, не единый ключ в `settings.controller`. | `PLANNING_UPSTREAM_URL`, `PLANNING_CRON_DISABLED`, `CRON_ENABLED`, `PLANNING_MODULE_IMAGE_NAME`. | `WeeklyPlanningJob` по расписанию; ручной `POST .../planning/.../jobs/weekly-plan/run` (в коде без `CRON_ENABLED` — намеренно для операторского запуска); маршруты `/planning`, `/api/planning/*`. |
| `ext.store` | **SystemSetting** `store_config` (`getStoreConfig` / `PATCH /settings/store`). | Образ витрины `STORE_VERSION` / compose `crm-store`; URL публичной витрины внутри JSON конфига. | Проверка `/api/settings/store`, публичный store отдельным деплоем. |
| `int.integrations_telegram` | **SystemSetting** `telegram_inbox` (`TelegramConfig`: токен бота, webhook, AI-ключи и т.д.) — `GET/PATCH /settings/telegram`. | **Модуль чисто in-process по upstream:** отдельного `TELEGRAM_UPSTREAM_URL` нет. Секреты в основном в JSON настройки (или env на стороне хоста — вне кода модуля). | `/settings/telegram`, `/api/conversations/*`, auth telegram routes; нет выделенного sidecar health. |
| `int.nova_poshta` | **IntegrationSetting** `provider = nova_poshta` (`NOVA_POSHTA_INTEGRATION_PROVIDER`): конфиг NP + `apiToken`; `GET/PATCH /settings/nova-poshta`. | `NP_UPSTREAM_URL`, `NP_CRON_DISABLED`, `NP_WRITES_DISABLED`, `CRON_ENABLED`, `NP_MODULE_IMAGE_NAME`, fallback отправителя: `NP_SENDER_*` (см. `np-ttn.service.ts` / `settings.service`). | Подробный runbook: [np-module-prod.md](np-module-prod.md); health `NP_UPSTREAM_URL`; cron `NpSyncCron` / `NpTtnCron`. **`NpCatalogSync`** с `@Cron` не в `NpModule.providers` — иначе дублирование ежедневной синхронии каталога с `NpSyncCron` (03:00 vs 03:10); оставляем только документацию. |
| `int.google_sheet` | **SystemSetting** `google_sheet` (`GoogleSheetConfig`, webhook in/out) — `GET/PATCH /settings/google-sheet` в `SettingsController`. | `GOOGLE_SHEET_UPSTREAM_URL`, `GOOGLE_SHEET_MODULE_IMAGE_NAME`, `MODULE_INTERNAL_SECRET` для прокси. | Маршруты `/integrations/google-sheet`, webhook с `X-Webhook-Secret`; health по upstream. |
| `int.bitrix` | Состояние синка/очередей — **доменные таблицы** (`BitrixSyncStateService` и др.); **отдельной** карточки Bitrix в `settings.controller` / settings home **нет** (конфиг не через типовой Settings UI). | `BITRIX_UPSTREAM_URL`, `BITRIX_CRON_DISABLED`, `CRON_ENABLED`, `BITRIX_SYNC_ENABLED`, `BITRIX_WEBHOOK_ENABLED`, `BITRIX_WEBHOOK_SECRET`, импорт: `BITRIX_MYSQL_*`, `BITRIX_IMPORT_*`, `BITRIX_MODULE_IMAGE_NAME`. | Проверка `/integrations/bitrix`, worker health; оператор смотрит логи sync/webhook и env-флаги. |
| `int.ringostat` | **IntegrationSetting** `provider = RINGOSTAT` (`RINGOSTAT_PROVIDER`): `RingostatConfig`; админ-роуты расширены в `ringostat-settings.controller.ts` (`/settings/ringostat`, backfill, reconcile и т.д.). | `RINGOSTAT_UPSTREAM_URL`, `RINGOSTAT_CRON_DISABLED`, `CRON_ENABLED`, `RINGOSTAT_MODULE_IMAGE_NAME`. | Health по upstream; polling под флагами; POST-операции только ADMIN. |

---

## Smoke / runbook (оператор)

Краткие шаги без рефакторинга UI: маршруты, настройки, cron, sidecar. Предпосылка: роль **ADMIN**, при `MODULE_GATING_ENABLED` — лицензия/entitlement на модуль.

### `core.crm`

- **Маршрут:** `GET /system/version` с core; для оператора — страница `/settings/health` (данные с `/system/*`).
- **Настройки:** общие карточки Settings (курсы, карты, Meta и т.д.) — см. `SettingsController`.
- **Cron:** модульных cron нет; phone-home CP — отдельно (не `CRON_ENABLED`).
- **Sidecar:** не применимо.

### `ext.visits`

- **Маршрут:** UI `/visits`, API `/api/visits/*` при effective-модуле.
- **Настройки:** нет выделенного `/settings/...` для модуля.
- **Cron:** нет `*_CRON_DISABLED` для visits.
- **Sidecar:** нет.

### `ext.manual_calling` и `ext.voice_outbound` (outbound stack)

- **Маршрут:** `/api/manual-calling/*`, `/api/calls/*`; голос — `/api/outbound/*`, `/api/integrations/outbound-voice/*`.
- **Настройки:** `GET/PATCH /settings/outbound-voice` (лицензия `ext.voice_outbound`).
- **Cron:** на core при sidecar — `OUTBOUND_CRON_DISABLED=true`; на worker — `CRON_ENABLED=true`; проверить логи `OutboundOrchestratorCron`.
- **Sidecar:** если задан `OUTBOUND_UPSTREAM_URL` — в health кэше upstream OK; руками: `curl {OUTBOUND_UPSTREAM_URL}/system/version`.

### `ext.finance`

- **Маршрут:** `/api/payments/*`, `/api/bank/*`, публичные payment-requests при необходимости.
- **Настройки:** UI `/settings/fop` ↔ `/bank/accounts`, visibility, store-default.
- **Cron:** `FINANCE_CRON_DISABLED` на core при `finance_worker`; `CRON_ENABLED` на worker.
- **Sidecar:** `FINANCE_UPSTREAM_URL` → health probe; логи `BankSyncCron`.

### `ext.production_planning`

- **Маршрут:** `/api/planning/*`, UI planning.
- **Настройки:** правила спроса — через API demand rules (`planning_demand_rules_v1` в БД), не отдельная карточка на home settings.
- **Cron:** `WeeklyPlanningJob` — `PLANNING_CRON_DISABLED` + `CRON_ENABLED` на расписании; ручной weekly run — см. контроллер planning.
- **Sidecar:** `PLANNING_UPSTREAM_URL` + `GET .../system/version`.

### `ext.store`

- **Маршрут:** `/api/settings/store`, checkout store NP при необходимости.
- **Настройки:** `GET/PATCH /settings/store` (тема, баннеры, URL витрины).
- **Cron:** нет `STORE_CRON_DISABLED`.
- **Sidecar:** витрина — образ **Next** `crm-store`, не Nest health из таблицы upstream.

### `int.integrations_telegram`

- **Маршрут:** `/api/settings/telegram`, `/api/conversations/*`, webhook бота.
- **Настройки:** `GET/PATCH /settings/telegram` (`telegram_inbox` в SystemSetting).
- **Cron:** нет модульного cron-флага.
- **Sidecar:** не поддерживается (только in-process).

### `int.nova_poshta`

- **Маршрут:** `/api/np/*`, store `/store/np/*`, TTN regex (см. прокси).
- **Настройки:** `GET/PATCH /settings/nova-poshta` (IntegrationSetting `nova_poshta`).
- **Cron:** `NP_CRON_DISABLED` на core при `np_worker`; `NpSyncCron` / `NpTtnCron` под `CRON_ENABLED`.
- **Sidecar:** `NP_UPSTREAM_URL`; на core при записи через worker — `NP_WRITES_DISABLED=true`. Детали: [np-module-prod.md](np-module-prod.md).

### `int.google_sheet`

- **Маршрут:** `/api/settings/google-sheet`, send-to-sheet под заказы.
- **Настройки:** `GET/PATCH /settings/google-sheet` (SystemSetting `google_sheet`).
- **Cron:** нет выделенного polling-cron в grep-матрице.
- **Sidecar:** `GOOGLE_SHEET_UPSTREAM_URL` → health.

### `int.bitrix`

- **Маршрут:** `/api/...` data-import / `/integrations/bitrix` (см. матрицу маршрутов в репо).
- **Настройки:** нет единой формы в Settings home; проверка env + БД состояния синка.
- **Cron:** `BITRIX_CRON_DISABLED`, `BITRIX_SYNC_ENABLED`, `BITRIX_WEBHOOK_ENABLED`, `CRON_ENABLED`.
- **Sidecar:** `BITRIX_UPSTREAM_URL` → health; импорт — переменные `BITRIX_MYSQL_*`.

### `int.ringostat`

- **Маршрут:** `/api/settings/ringostat/*`, интеграция `/integrations/ringostat`.
- **Настройки:** `GET/PATCH /settings/ringostat` + POST-операции backfill/reconcile в `ringostat-settings.controller.ts`.
- **Cron:** `RINGOSTAT_CRON_DISABLED`, `CRON_ENABLED`, сервис polling.
- **Sidecar:** `RINGOSTAT_UPSTREAM_URL` → health.

---

## Прокси: static + regex (как в коде)

**Static** (`MODULE_UPSTREAM_STATIC_MOUNTS`, порядок префиксов — длинные первыми при монтировании):

- `OUTBOUND_UPSTREAM_URL` → `/integrations/outbound-voice`, `/outbound`, `/manual-calling`, `/calls`
- `GOOGLE_SHEET_UPSTREAM_URL` → `/integrations/google-sheet`
- `BITRIX_UPSTREAM_URL` → `/integrations/bitrix`
- `NP_UPSTREAM_URL` → `/store/np`, `/np`
- `FINANCE_UPSTREAM_URL` → `/public/payment-requests`, `/payment-requests`, `/payments`, `/bank`
- `PLANNING_UPSTREAM_URL` → `/planning`

**Regex** (`MODULE_UPSTREAM_REGEX_MOUNTS`):

- Finance: `/orders/:id/payment-requests`
- Google Sheet: `/orders/:id/send-to-sheet`, `/settings/google-sheet`
- Ringostat: `/integrations/ringostat`, `/settings/ringostat`
- NP: `/orders/:id/np/ttn`, `/orders/:id/ttn`, `/shipments/:id/np/ttn`

Path rewrite для NP при regex — `module-upstream-path-rewrite.ts`.

---

## Владение cron (single-writer)

| Логика | Файл / сервис | Флаги |
|--------|----------------|-------|
| Bank sync | `bank-sync.cron.ts` | `FINANCE_CRON_DISABLED`, `CRON_ENABLED` |
| NP TTN | `np-ttn.cron.ts` | `NP_CRON_DISABLED`, `CRON_ENABLED` |
| NP directories/streets | `np-sync.cron.ts` | `NP_CRON_DISABLED`, `CRON_ENABLED` |
| Ringostat polling | `ringostat-polling.service.ts` | `RINGOSTAT_CRON_DISABLED`, `CRON_ENABLED` |
| Bitrix delta | `bitrix.delta-sync.service.ts` | `BITRIX_CRON_DISABLED`, `CRON_ENABLED`, `BITRIX_SYNC_ENABLED` |
| Bitrix webhook retry | `bitrix-webhook.service.ts` | `BITRIX_CRON_DISABLED`, `CRON_ENABLED`, `BITRIX_WEBHOOK_ENABLED` |
| Control Plane phone-home | `control-plane-phone-home.service.ts` | *(нет `CRON_ENABLED` / `*_CRON_DISABLED`)* — системный телеметрический cron; не относится к single-writer модулей |
| NP catalog daily (`NpCatalogSync`) | `np-catalog.sync.ts` | `NP_CRON_DISABLED`, `CRON_ENABLED` *(класс с `@Cron` **не** в `NpModule.providers`: ежедневный запуск в 03:00 пересёкся бы с `NpSyncCron` в 03:10 на тех же справочниках — дубль нагрузки на NP API; оставить только `NpSyncCron` или удалить/слить логику перед регистрацией)* |
| Outbound orchestrator | `outbound-orchestrator.cron.ts` | `OUTBOUND_CRON_DISABLED`, `CRON_ENABLED` |
| Weekly planning | `weekly-planning.job.ts` | `PLANNING_CRON_DISABLED`, `CRON_ENABLED` (только `@Cron` `generateWeeklyItems`; `runNow()` для ручного запуска — по-прежнему только `PLANNING_CRON_DISABLED` + gating) |

**Рекомендация:** на core при sidecar выставлять соответствующий `*_CRON_DISABLED=true` и при необходимости `CRON_ENABLED=true` на worker, чтобы не дублировать фоновые задачи.

---

## Маршруты: кто владеет

- Браузер и BFF **всегда** бьют в один `API_URL` (core); core либо обрабатывает сам, либо **проксирует** на sidecar те же пути (`module-upstream-proxy.setup.ts`).
- Worker-образы поднимают урезанный Nest без глобального прокси — клиент к ним напрямую обычно не ходит, только core как reverse-proxy.
- Next `apps/web/src/app/api/**/route.ts` — тонкие прокси к backend; полный список не дублируется — см. grep по префиксам в матрице.

---

## Решения по аудиту (Telegram / Bitrix)

- **Telegram:** sidecar **не поддерживается** в репозитории. Удалены `telegram_worker` из `WORKER_VARIANT_INSTALLED` и запись `TELEGRAM_UPSTREAM_URL` из `MODULE_UPSTREAM_ENV`. Модуль остаётся только in-process (в т.ч. в составе `outbound_worker` для установленного набора модулей образа outbound).
- **Bitrix:** `BitrixWebhookModule` уже импортировал `BitrixSyncModule`; в `bitrix-main.ts` добавлен явный импорт `BitrixSyncModule` рядом с webhook-модулем и уточнён комментарий под compose (`BITRIX_SYNC_ENABLED`). Поведение соответствует `compose.modules.bitrix-sidecar.yml`.

---

## Release / compose: Docker target ↔ entrypoint ↔ sidecar ↔ `BACKEND_VARIANT`

Образ собирается из [`apps/backend/Dockerfile`](apps/backend/Dockerfile) (контекст сборки — корень репозитория). В compose sidecar-сервисы задают `CRON_ENABLED` и (где указано) `BACKEND_VARIANT`; для `backend-outbound` вариант зашит в образе стадии `outbound-runner`.

| Docker `--target` | JS entry (`CMD`) | Сервис в compose (`*-sidecar.yml`) | `BACKEND_VARIANT` |
|-------------------|------------------|--------------------------------------|-------------------|
| `runner` (default / full CRM) | `dist/main.js` | `backend` | `full` (в образе стадии `runner`) |
| `core-runner` | `dist/core-main.js` | `backend` (образ core) | `core` |
| `outbound-runner` | `dist/outbound-main.js` | `backend-outbound` | `outbound_worker` (в образе; в compose не дублируется) |
| `google-sheet-runner` | `dist/google-sheet-main.js` | `backend-google-sheet` | `google_sheet_worker` |
| `ringostat-runner` | `dist/ringostat-main.js` | `backend-ringostat` | `ringostat_worker` |
| `bitrix-runner` | `dist/bitrix-main.js` | `backend-bitrix` | `bitrix_worker` |
| `np-runner` | `dist/np-main.js` | `backend-np` | `np_worker` |
| `finance-runner` | `dist/finance-main.js` | `backend-finance` | `finance_worker` |
| `planning-runner` | `dist/planning-main.js` | `backend-planning` | `planning_worker` |

Исходные точки входа: `apps/backend/src/main.ts` (full), `core-main.ts`, `outbound-main.ts`, `google-sheet-main.ts`, `ringostat-main.ts`, `bitrix-main.ts`, `np-main.ts`, `finance-main.ts`, `planning-main.ts`.

---

## Follow-up (второй PR / вне скоупа)

- Проверка `MODULE_INTERNAL_SECRET` на стороне workers (см. [module-internal-auth.md](module-internal-auth.md)).
- Расширение `/settings/health` и системных DTO.
- Полноценный Telegram sidecar — только при отдельном ТЗ (main, Dockerfile, compose, proxy).
