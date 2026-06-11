# Changelog

Все значимые изменения монорепозитория фиксируются здесь (кратко). Детали модульности — `docs/CRM-modularity-structure.md`, статус фаз — `docs/module-split-progress.md`.

## Unreleased

_(планируемые изменения после **0.2.79**.)_

## [0.2.79] — 2026-06-11

### Summary

Патч **0.2.79**: **Kyivstar FMC** (`int.kyivstar_fmc`) — импорт звонков, webhooks, recordings, settings UI; **field shifts** + **/visits/team** (карта менеджеров, GPS-трек); **mobile** — фоновый GPS, EAS dev build; доработки **warehouse**, **orders** (legacy status mapping), **tasks**, **fuel**.

### Added

- **Integration `kyivstar-fmc`**: ingest, polling, backfill, workspace API; sidecar `crm-module-kyivstar-fmc`, `compose.modules.kyivstar-fmc-sidecar.yml`, proxy `KYIVSTAR_FMC_UPSTREAM_URL`.
- **Web**: `/settings/kyivstar-fmc`, BFF integrations; **`/visits/team`** — TeamFieldMap/List, pending fuel.
- **Field**: `FieldShiftsService` — start/stop shift, location samples batch, team view; API `/field/shifts/*`.
- **Mobile**: фоновый location tracking (`location-tracking-task`, `shift-tracking-context`), `eas.json`, разрешения в `app.json`.
- **Prisma**: миграция **`20260609120000_lead_source_kyivstar`** — `LeadSource.KYIVSTAR`.
- **CI**: module image **`kyivstar-fmc`** в полном манифесте 0.2.x.

### Changed

- **Warehouse workspace**: расширенный UI збірки, переходы `READY_TO_SHIP` ↔ `CONFIRMED`.
- **Orders**: legacy `Order.status` → `orderStage` mapping (фильтры, kanban); fulfillment queue fields.
- **Tasks**: фильтры/отображение; **EntityTasksList** — доработки.
- **Visits**: subnav (team), fuel/history pages; **Settings → Health** — мелкие правки.
- **Leads/Contacts**: source Kyivstar в модалках.
- **Store**: категории / PopularSystems.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.79`**, полный манифест (8 module images + store).
- **`prisma migrate deploy`** — `20260609120000_lead_source_kyivstar`.
- Kyivstar sidecar: **`KYIVSTAR_FMC_UPSTREAM_URL`** на `backend`, **`KYIVSTAR_FMC_CRON_DISABLED=true`** на core при worker.

## [0.2.78] — 2026-06-05

### Summary

Патч **0.2.78**: **one-click update** — сервіс `updater` у `compose.client.yml` (Docker socket + `agent.mjs`); спрощений UI **Settings → Health**; warehouse workspace показує **коментар** і **документи** замовлення.

### Added

- **`scripts/updater/Dockerfile`** + сервіс **`updater`** у compose (порт 7788, `UPDATER_AGENT_URL=http://updater:7788` за замовчуванням).
- **Fulfillment queue**: поле **`comment`** у відповіді API; **`documentsRequested`** у типах web.

### Changed

- **Settings → Health**: одна кнопка «Оновити» (preflight + apply); діагностика прихована за toggle.
- **Warehouse workspace**: блок «Документи» / «Коментар» у модалці збірки.
- **`.env.client.example`**: updater тепер через compose, без ручного `UPDATER_AGENT_URL` на хості.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.78`**, повний манифест; міграцій немає.
- Після `pull` / `up -d` з’явиться контейнер **`updater`**; потрібен доступ до **`/var/run/docker.sock`** на хості.
- Опційно: **`UPDATER_AGENT_TOKEN`** — спільний секрет backend ↔ updater.

## [0.2.77] — 2026-06-05

### Summary

Патч **0.2.77**: **склад** — workspace только для збірки (`CONFIRMED` → `READY_TO_SHIP`); **stock readiness** (NONE/PARTIAL/FULL) на замовленнях `AWAITING_STOCK`; legacy `Order.status` у фільтрах і kanban; **updater agent** env у compose; seed demo-замовлення для WAREHOUSE; роль **`formatUserRole`** у web.

### Added

- **`order-stock-readiness`**: обчислення наявності по складу / `Product.stock`; поле **`stockReadiness`** у списку замовлень.
- **Web**: **`StockReadinessBadge`**, бейдж на kanban для `AWAITING_STOCK`; **`roleLabels`**.
- **Backend**: **`legacyStatusesForOrderStage(s)`** — фільтр `orderStages` враховує legacy `status`.
- **Seed**: demo WH-DEMO-STOCK / WH-DEMO-PICK / WH-DEMO-SHIP для ролі WAREHOUSE.
- **Compose / env**: `UPDATER_AGENT_URL`, `UPDATER_AGENT_TOKEN`, `CRM_RELEASE_VERSION`, `GIT_SHA`, `BUILD_TIME`, `IMAGE_TAG`; `npm run dev:updater`.
- **Settings → Health**: ручний target version для update flow.

### Changed

- **Warehouse workspace** (`/work/warehouse`): лише `CONFIRMED`, модалка збірки, без вкладок picking/shipping.
- **WAREHOUSE role**: дозволені переходи `CONFIRMED` ↔ `READY_TO_SHIP`; fulfillment queue = тільки `CONFIRMED`.
- **OrdersKanban**: legacy status → stage mapping; warehouse mode фільтрує на клієнті.
- **OrderModal**: warehouse stepper спрощено під workspace.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.77`**, повний манифест; міграцій немає — `pull` / `up -d`.
- Опційно: `UPDATER_AGENT_URL` + `UPDATER_AGENT_TOKEN` на хості для кнопки оновлення в Settings → Health.

## [0.2.76] — 2026-06-05

### Summary

Патч **0.2.76**: **fix CI** — web **`fulfillment-queue`** route (`NextRequest`); повторная попытка после падений **0.2.74** (backend `google-drive`) и **0.2.75** (web build). Содержимое = **0.2.75** (bank Privat24/UPC + **0.2.74** features).

### Fixed

- **`apps/web/.../fulfillment-queue/route.ts`**: `Request` → `NextRequest` для `proxyToBackend`.
- **`apps/web/.../route-plans/geometry/preview/route.ts`**: убран 3-й аргумент у `proxyToBackend` из `proxy.server` (2-arg API).
- **`RouteLayerControls`**: тип `ROUTE_LAYER_STYLES` → `google.maps.PolylineOptions` (CI `tsc`).

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.76`**, полный манифест, миграции как у **0.2.75**.

## [0.2.75] — 2026-06-05

### Summary

Патч **0.2.75**: **fix CI** — TypeScript в **`google-drive.client`** (0.2.74 не собрался); **банк** — Privat24/UPC как integrations, payment matching, settings UI; рефакторинг bank sync/providers. Включает **0.2.74** (WAREHOUSE, route geometry, fulfillment queue).

### Fixed

- **`google-drive.client.ts`**: тип `DriveAuth` — совместимость с `google.drive()` в Docker/CI (0.2.74 падал на `tsc`).

### Added

- **Integrations**: **`privat24`**, **`upc`** (consent, sync); **`payment-matching.service`**, **`bank-provider.registry`**.
- **Web**: settings **bank / privat24 / upc**, API integrations.
- **Prisma**: миграция **`bank_providers_upc_matching`** (UPC provider, match status на транзакциях).

### Changed

- Bank module — провайдеры вынесены из legacy `privat24.client`; FOP settings упрощены.
- **Module registry** / contracts — Privat24 module id.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.75`**, полный манифест.
- **`prisma migrate deploy`** — **`20260603120000_add_warehouse_user_role`** (если пропущена с 0.2.74) + **`20260603120000_bank_providers_upc_matching`**.

## [0.2.74] — 2026-06-03

### Summary

Полный релиз **0.2.x**: роль **WAREHOUSE**, очередь комплектации заказов, **route geometry** (polyline, карта web/mobile), доработки **visits/fuel**, **orders** kanban, **contacts/timeline**, **field-fuel**, **Ringostat** ingest, **stock SKU**; миграция **`add_warehouse_user_role`**.

### Added

- **RBAC**: роль **`WAREHOUSE`**, `order-warehouse-role`, fulfillment queue API/UI (`/work/warehouse`).
- **Visits**: `polyline.util`, route geometry types, BFF **`/api/route-plans/geometry`**; mobile **`route-map.ts`**.
- **Web**: visits map components, **`activityDisplay`**, **`contact-address.util`**, orders resource.
- **Docs**: **`docs/commercial-proposal-uk.md`**.

### Changed

- **Route plans** — геометрия маршрута, controller/service.
- **Orders** — фильтры/очередь для warehouse role; kanban/page.
- **Field fuel**, **Ringostat ingest**, **stock-sku-normalizer**, **contacts** card/timeline.
- **Visits** history/fuel/page, **catalog**, entity modals, locales.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.74`**, полный манифест.
- **`prisma migrate deploy`** — enum **`UserRole.WAREHOUSE`** (`20260603120000_add_warehouse_user_role`).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. на `backend`.

## [0.2.73] — 2026-05-25

### Summary

Патч **0.2.73**: **остатки по SKU** — нормализация артикулов (кириллица/латиница) при загрузке Excel; **модалки** leads/orders/companies/contacts — выравнивание layout и UX.

### Added

- **`stock-sku-normalizer`** + тесты; **`prepareBulkWarehouseStock`** в `ProductStore`.

### Changed

- **Products controller** — bulk stock через новый резолвер SKU.
- **Web modals**: Lead, Order, Company, Contact, CreateLead/Order.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.73`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.72] — 2026-05-25

### Summary

Патч **0.2.72**: **НП ТТН** — просмотр/редактирование, update с `Ref`/`IntDocNumber`; **TtnModal** и BFF; **сотрудники** — адрес маршрута (`RouteAddressInput`, Google Places); доработки модалок **company/contact/lead/order**; локали.

### Added

- **Backend NP**: `getTtnDetailsByOrderId`, редактирование черновика ТТН; контроллер endpoints.
- **Web**: `RouteAddressInput`, `useRouteAddressField`; расширенный **TtnModal**.

### Changed

- **EmployeeModal** — рефакторинг, маршрут start/end через Places.
- **OrderModal**, **CompanyModal**, **ContactModal**, **LeadModal** — адреса/Places.
- **googlePlacesNew** — мелкие правки.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.72`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.71] — 2026-05-25

### Summary

Патч **0.2.71**: **контакты** — новый UX модалки (`ContactCreateForm`, регионы, проверка дубликата телефона), обязательный **region** при создании; **EntityModalShell**; локали; очередь звонков и компании — мелкие правки.

### Added

- **Web**: `ContactCreateForm`, `contact-region-options`, `useContactPhoneDuplicateCheck`.
- **Docs**: `UX-MODALS.md`.

### Changed

- **ContactModal** — рефакторинг под shell; **contacts/companies** pages.
- **Backend**: `region` required в create contact DTO/service.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.71`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.70] — 2026-05-25

### Summary

Патч **0.2.70**: **Nova Poshta** — кнопка **«Синхронізувати довідники»** в настройках (города/отделения), BFF **`POST /api/np/sync`**, локали en/uk.

### Added

- **Web**: `apps/web/src/app/api/np/sync/route.ts`, UI sync в **`/settings/nova-poshta`**.

### Changed

- Подсказки отправителя: сначала синхронизация справочников.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.70`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.69] — 2026-05-25

### Summary

Полный релиз **0.2.x**: **склады** (CRUD API, DTO, модалка в каталоге), доработки **остатков** и заказов; **Nova Poshta** — выбор отправителя из справочников (counterparties/contacts), обновлённый UI настроек и локали.

### Added

- **Warehouses**: `create`/`update`/`delete`, уникальность name/externalCode; **web** `WarehousesModal`, BFF warehouses API.
- **NP settings**: `NpDirectorySelects`, API sender-counterparties/contacts, `np-sync` helpers.

### Changed

- **Catalog**, **stock-upload**, **products** — привязка к складам.
- **Orders** modals — выбор склада.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.69`**, полный манифест; миграций Prisma нет — `pull` / `up -d`.

## [0.2.68] — 2026-05-20

### Summary

Патч **0.2.68**: **Visits** — план маршрута для **MANAGER** по умолчанию показывает **свои** визиты (`ownerId` = текущий пользователь), если фильтр владельца скрыт.

### Fixed

- **Web** `visits/page.tsx`: `planOwnerOpts` с `useMemo` — менеджер без ADMIN/LEAD видит свой план, а не «всех».

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.68`**, полный манифест; миграций нет — `pull` / `up -d`.

## [0.2.67] — 2026-05-20

### Summary

Полный релиз **0.2.x** (все module-образы в CI): **voice gateway** — `gateway-service` (Kyivstar, RTP allocator, media bridge), новый **`sip-adapter-service`**, **`compose.modules.voice-gateway.yml`**, док **`docs/voice-gateway-deploy.md`**; **visits** — owner scope, маршруты/сессии; **web** — каталог (поиск), план визитов; **field-fuel** — мелкие правки.

### Added

- **`apps/sip-adapter-service`**: HTTP API, FreeSWITCH ESL, outbound/media attach.
- **`apps/gateway-service`**: Dockerfile, `rtp-port-allocator`, расширение Kyivstar provider.
- **`compose.modules.voice-gateway.yml`**, **`visits-owner-scope.ts`**, **`catalog-search.ts`**.

### Changed

- **Route plans / sessions / visits** — scope по владельцу, API и UI.
- **Gateway orchestrator** — lifecycle, canary, webhook client.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.67`**, полный манифест + `pull` / `up -d`.
- **Voice gateway** (опционально): overlay **`compose.modules.voice-gateway.yml`**, env см. **`docs/voice-gateway-deploy.md`** (образы gateway/sip — local build в compose, не в стандартном GHCR module CSV).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. — **`docs/modules-prod-matrix.md`**.

## [0.2.66] — 2026-05-20

### Summary

Патч **0.2.66**: **каталог** (карточка товара, панель характеристик), **история визитов** (фильтры, координаты на карте), **сотрудники** — полевой профиль топлива в API/UI; **visit-coordinates**, доработки **route-plans** и **field-fuel**.

### Added

- **Catalog**: `CatalogProductCard`, `ProductCharacteristicsPanel`.
- **Visits history**: `visit-history-utils`, расширенный UI и API.
- **Backend**: `visit-coordinates.ts`, тесты; **users** — `fieldProfile` в list/update.

### Changed

- **Route plans**, **visits service**, **field-fuel** — уточнения расчётов/координат.
- **EmployeeModal** — настройки авто/топлива для менеджера.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.66`**, полный манифест; миграций Prisma в этом патче нет (если уже на **0.2.65** — достаточно `pull` / `up -d`).

## [0.2.65] — 2026-05-20

### Summary

Полный релиз **0.2.x** (все module-образы в CI): **топливные отчёты** (снимок визитов, пересчёт, export), **route geometry** для маршрутов, **Field API** (fuel day/range/profile, events/listener), **web** — раздел **Visits → Fuel**, BFF **`/api/field/fuel/*`**; **mobile** — экраны топлива и профиль авто. Миграция **`fuel_report_visit_snapshot`**.

### Added

- **Fuel**: `FuelDayReport` snapshot/metrics, `field-fuel.listener`, recalculate/submit; **web** `visits/fuel`, **mobile** `app/fuel/*`.
- **Visits**: `route-geometry.ts`, тесты; доработка `route-plans.service`.
- **Web API**: `field-fuel` resource, `VisitsSubNav`.

### Changed

- **Field fuel service** — расширенный расчёт и статусы компенсации.
- **Mobile** tabs (index, more), docs **`05-api-changes`**.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.65`**, **`prisma migrate deploy`** (колонки `FuelDayReport`), полный манифест + `pull` / `up -d`.
- Сайдкары: **`NP_UPSTREAM_URL`** и др. — **`docs/modules-prod-matrix.md`**.

## [0.2.64] — 2026-05-15

### Summary

Полный релиз **0.2.x** (все module-образы + store в CI): **мобильное приложение менеджера** (Expo), **Field API** (смены, GPS-трек, топливо), **GPS-верификация визитов**, доработки **store** (корзина, UI), **web** proxy/companies, Prisma-миграция. Включает **0.2.61–0.2.63** (Google Drive, companies, NP docs).

### Added

- **`apps/mobile`**: Expo-клиент (визиты, смена, карта, клиенты) — см. **`docs/mobile-manager-app/`**.
- **Backend `FieldModule`**: `/field/...` — смены, location samples, fuel day reports; **`VisitGpsEvent`**, верификация start/complete визита.
- **Prisma**: миграция `20260515193000_mobile_field_gps_fuel`.
- **Store**: `CartContext`, улучшения cart/product UI.
- **Web**: `proxy-request-headers`, companies `[id]` API.

### Changed

- **Visits**: `GET /visits/:id`, GPS payload на start/complete.
- **Nginx/docs**: suprex.dental, operator runbook.

### Upgrade notes

- **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.64`**, полный манифест + **`prisma migrate deploy`** (новые таблицы field/GPS).
- Сайдкары: **`NP_UPSTREAM_URL`** и др. на `backend` — **`docs/modules-prod-matrix.md`**.

## [0.2.63] — 2026-05-15

### Summary

Полный релиз линии **0.2.x**: CI собирает **все** образы — **`crm-backend-core`**, **`crm-core-api`**, **`crm-web`**, **`crm-store`**, модули **outbound**, **google-sheet**, **ringostat**, **bitrix**, **np**, **finance**, **planning**. Манифест с **`compose.base.yml`**, **`compose.client.yml`**, **`compose.modules.store.yml`** и всеми **`compose.modules.*-sidecar.yml`**, **`composeFileUrls`**. Код = **0.2.62** (Google Drive, companies, NP docs).

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.63`**, целевой релиз в CP, **`client-pull-agent`** или полный **`docker compose pull`** по **`composeFiles`** из манифеста + **`up -d`** (при смене состава — **`--remove-orphans`**).
- При сайдкарах в манифесте: на **`backend`** задайте **`NP_UPSTREAM_URL`**, **`OUTBOUND_UPSTREAM_URL`** и т.д. (см. **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**).
- Фото каталога: **Settings → Google-таблиця**; NP: **Settings → Nova Poshta**.

## [0.2.62] — 2026-05-15

### Summary

Патч **0.2.62**: создание компании **только с именем**; опциональные поля как `null` не ломают валидацию; ответственный по умолчанию — создатель; форма создания в web.

### Fixed

- **Companies**: DTO create/update — корректная обработка `null` для необязательных полей; create без пустых полей; **`ownerId`** по умолчанию от текущего пользователя.
- **Web**: **`CompanyModal`** — создание с одним именем, автоподстановка ответственного.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.62`**, `pull` / `up -d` (или **`client-pull-agent`**).

## [0.2.61] — 2026-05-15

### Summary

Патч **0.2.61**: **Google Drive** для фото каталога — папка и service account в **Settings → Google-таблиця** (БД), с fallback на env; прокси картинок без auth cookie; **MANAGER** может создавать/редактировать свои компании; **compose.client.yml** — проброс `GOOGLE_*` в `backend`; документация **NP sidecar** (`NP_UPSTREAM_URL` / `NP_WRITES_DISABLED` / CP manifest).

### Added

- **Settings → Google-таблиця**: `driveFolderId`, `serviceAccountJson`; **`resolveGoogleDriveConfig()`** для sync и proxy.
- **Web**: UI Drive в **`/settings/google-sheet`**; публичный BFF **`/api/products/images/.../source`** (stream с backend).

### Changed

- **Product images**: sync/proxy через credentials из Settings; **`google-drive.client`** принимает auth снаружи.
- **Companies**: **MANAGER** на create/update; update только своих компаний.
- **Catalog**: ссылка на настройки Drive вместо env-only подсказки.
- **Docs**: NP sidecar vs `.env`, **`docs/cp-v0.2.3.md`**, **`.env.base.example`**, чеклист suprex под **0.2.61**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.61`**, манифест + **`client-pull-agent`** или **`pull` / `up -d`**. Фото товаров: **Settings → Google-таблиця** (или env **`GOOGLE_*`** в **`compose.client.yml`**). NP sidecar: **`NP_UPSTREAM_URL=http://backend-np:3001`** — см. **`docs/np-module-prod.md`**.

## [0.2.6] — 2026-05-17

### Summary

Патч **0.2.6**: доработки **модульного прокси** (rewrite путей к upstream), **Nova Poshta** (TTN/клиент/константы, настройки в CRM вместо env), **Settings** (Nova Poshta API + UI), **module state / registry**, **Bitrix** webhook, мелкие правки **outbound / planning**; **web** — RBAC BFF на **`[[...path]]`**, redirect **`/api/api/*`**, гейтинг **«Nova Poshta»** в настройках, локали и health; документация **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**; контрактные/юнит-тесты модулей и прокси.

### Added

- **`apps/web`**: страница и API-прокси **Settings → Nova Poshta**; **`apps/backend`**: расширение **`settings.service`** / controller под NP integration.
- **`module-upstream-path-rewrite`** и тесты; **`np.constants`**, **`modules-prod-contract.spec.ts`**.
- Доки: **`docs/modules-prod-matrix.md`**, **`docs/np-module-prod.md`**.

### Changed

- **NP module**: `np-ttn`, client, catalog/cron sync, module wiring.
- **Module proxy**: `module-upstream-proxy.setup`, health/registry/state.
- **Web**: `next.config` redirects; `api/rbac` optional catch-all segment; `api/client`, outbound/settings layouts, settings home link.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.6`**, манифест + **`client-pull-agent`** или **`pull` / `up -d`**. Конфиг НП в проде — см. **`docs/np-module-prod.md`**.

## [0.2.5] — 2026-05-16

### Summary

Патч **0.2.5**: очередной выпуск линии **0.2.x**; рекомендуемый тег образов и манифеста для прода после зелёного **Publish Registry Release**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.5`**, затем **`pull` / `up -d`** (или **`client-pull-agent`**) по манифесту с **`composeFileUrls`** и **`compose.modules.store.yml`**.

## [0.2.4] — 2026-05-15

### Summary

Патч **0.2.4**: манифест для Control Plane по умолчанию включает **`compose.modules.store.yml`** (вместе с **`composeFileUrls`**), чтобы **`client-pull-agent`** и **`docker compose`** поднимали **`crm-store`** без отдельного PATCH; обновлены операторские доки (**`docs/cp-v0.2.3.md`**, **`docs/bio3ua-core-only.md`**, **`README.md`**).

### Added

- **`compose.modules.store.yml`** в **`composeFiles`** / **`composeFileUrls`** при **Publish Registry Release** и в **`rollout-loop-dry-run`**.

### Changed

- **`docs/cp-v0.2.3.md`**: манифест vs лицензия, **`moduleCodes`** vs подписка, **`metadata.ci_unknown_root_fields`**, preflight сервера (**`LICENSE_FILE_PATH_HOST`**, orphan-сервисы, полный **`-f`**); allowlist CP для **`compose.modules.store.yml`**.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.4`**, затем манифест из CI/CP (с **`compose.modules.store.yml`**) и **`client-pull-agent`** или **`pull` + `up -d`** с полным **`-f`**.

## [0.2.3] — 2026-05-14

### Summary

Патч **0.2.3**: манифест релиза для Control Plane дополняется **`composeFileUrls`** (ссылки на compose в GitHub по SHA коммита), плюс скрипты для клиента (**`sync-compose-from-manifest`**, **`suprex/client-pull-agent.sh`**). Рекомендуемый образ для прода после зелёного CI.

### Added

- **`composeFileUrls`** в `deployment-manifest.json` при **Publish Registry Release** (URL на `raw.githubusercontent.com` по полному SHA коммита GitHub Actions) для **каждого** пути из **`composeFiles`**.
- **`scripts/sync-compose-from-manifest.mjs`** и **`suprex/client-pull-agent.sh`**: скачивание отсутствующих compose с хоста и **`docker compose … pull`** по списку `-f` из манифеста.

### Changed

- В манифесте поле **`gitSha`** — полный SHA коммита (согласовано с URL raw compose).
- **`scripts/rollout-loop-dry-run.sh`**: те же `composeFileUrls` в dry-run, исправлен путь к **`resolve-modules-csv.mjs`** через **`REPO_ROOT`**, **`compatibility.line`** из версии.

### Upgrade notes

- Клиентам: **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** → **`0.2.3`**, затем pull/up. Для install bundle без полного git clone: **`MANIFEST_URL`** (или локальный манифест) + **`suprex/client-pull-agent.sh`** — см. **`docs/RELEASING.md`** и **`docs/cp-v0.2.3.md`**.
- **Control Plane** должен хранить и отдавать **`composeFileUrls`** в JSON манифеста (см. **`docs/cp-v0.2.3.md`**).

## [0.2.2] — 2026-05-13

### Summary

Патч-релиз **0.2.2** по линии **0.2.x**: исправления инфраструктуры релиза и манифеста, чтобы **образ `crm-backend-core`**, **список `composeFiles` для Control Plane** и **сборка web** соответствовали ожиданиям операторов и client-pull-agent.

### Fixed

- **Docker / `crm-backend-core`**: последний stage в `apps/backend/Dockerfile` больше не «уезжает» в `planning-runner`; добавлен финальный **`FROM runner`**. В **Publish Registry Release** и **Preflight** для образа backend явно **`target: runner`**. В **`docker-compose.prod.yml`** для `backend` указан **`target: runner`** при `--build`. Устраняет **`BACKEND_VARIANT=planning_worker`** у контейнера, который должен быть полным API.
- **CI module images**: `docker buildx imagetools inspect` — чтение digest через **`json .Manifest`** и fallback по тексту **`Digest:`** (совместимость с новым buildx).
- **Control Plane manifest**: роли optional module-образов — **`module`** (не `module_*`), кроме **`module_outbound`**; соответствие allowlist CP.
- **`composeFiles` в манифесте**: для `google-sheet` только **`compose.modules.google-sheet-sidecar.yml`**; удалён дублирующий **`compose.modules.google-sheet.yml`**. В **`ci-publish-module-builds.mjs`** проверка **существования каждого compose-пути** в репозитории перед записью addon.
- **Web production build**: в JSX заменены **`->`** на **`→`** в `outbound-voice` и `ringostat` settings (парсер JSX).

### Upgrade notes

- **Не использовать в проде теги образов `crm-backend-core:0.2.0`** (и при необходимости проверьте **`0.2.1`**, если собирался до фикса Dockerfile): рекомендуемый полный патч (**все module-образы**, **`composeFileUrls`**, **`compose.modules.store.yml`**) — **`0.2.79`**; иначе минимум **`0.2.6`** … **`0.2.2`** для `BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`, затем `pull` и `up -d`.
- После обновления CP: при необходимости **PATCH манифеста** (см. документацию CP) или перерегистрация релиза с валидным **`composeFiles`**.

## [0.2.0] — 2026-05-13

### Summary

Минорный релиз **0.2.0**: линия поставки **0.2.x**. В **Publish Registry Release** для версий **`0.2.*`** при **пустом** поле **modules** (в т.ч. при push тега `v0.2.*`, когда inputs нет) CI собирает **все** опциональные module-образы: outbound, google-sheet, ringostat, bitrix, np, finance, planning. Для **`0.1.*`** пустой CSV по-прежнему означает «без отдельных module-образов». Манифест для Control Plane получает **`compatibility.line`** вида **`M.m.x`** из версии релиза (например `0.2.x` для `0.2.0`). В образы входит код на момент тега/запуска workflow.

### Changed

- **CI / релиз**: `publish-release.yml` — при версии `0.2.*` и пустом CSV **modules** собираются все optional module images; `compatibility.line` в `deployment-manifest.json` выводится из semver (`0.2.x`, `0.1.x`, …).
- **Версии пакетов**: `apps/backend`, `apps/web`, `apps/store` → `0.2.0`.
- **Документация**: `README.md`, `docs/RELEASING.md`, `docs/git-release-workflow.md`, `.env.base.example` — линия **0.2.x** и примеры версий образов.

### Upgrade notes

- Клиентам на **0.1.x**: переход на **0.2.x** — минорный bump; сверить **compose**, **`.env`**, **миграции Prisma**, **license.json** / пилоты и **`MODULE_GATING_ENABLED`**. Patch-совместимость внутри **0.2.x** — по правилам в `README.md`.

## [0.1.5] — 2026-05-02

### Added

- **Core-only**: `AppModuleCore`, entrypoint `core-main`, образ `crm-core-api`, прокси/upstream для модулей; `BACKEND_VARIANT=core`.
- **Модули**: отдельные entrypoints/worker-образы, sidecar compose; скрипты `ci-publish-module-builds.mjs`, `resolve-modules-csv.mjs`.
- **Finance idempotency**: `FinanceIdempotencyRecord`, interceptor для идемпотентных POST.
- **Data import / custom entities**: Prisma-модели, API, BFF, UI настроек; job-flow импорта (upload → validate → commit).
- **Control Plane**: телеметрия phone-home, `GET /system/control-plane`, health UI.
- **Workflows**: лог executions API, события для company, product, task, activity; enum `TASK` / `ACTIVITY` в `CustomFieldEntityType`.
- **Layouts runtime**: `GET /layouts/runtime/list` (MetadataRead) для карточек.
- **Документация**: onboarding, git-release, e2e smoke, security baseline, customer success; контрактный тест deployment manifest в CI preflight.

### Changed

- Модульность: `@RequireModule` и compose overlays; обновлены `docs/CRM-modularity-structure.md`, runbook.
