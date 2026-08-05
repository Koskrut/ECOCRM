# После обновления: что и где проверить (модули / compose)

Контекст: install bundle вроде **`/opt/crm`**, env **`suprex/.env`**, манифест с CP или **`deployment-manifest.json`**.

Актуализировано под зелёный релиз **`v0.2.140`** (MRP false PKG BOM, GPS OSRM — см. **`CHANGELOG.md` [0.2.140]**).

## 0. Rollout после зелёного **Publish Registry Release** (CP → сервер)

1. **Control Plane:** для установки выставлен целевой релиз **`0.2.140`**; **`rollouts/next`** (или выдача **`MANIFEST_URL`**) возвращает JSON с **`version`: `0.2.140`**, полным **`composeFiles`** (в т.ч. **`compose.modules.store.yml`**) и **`composeFileUrls`** на каждый путь.
2. **Сервер:** в **`suprex/.env`** — **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.140`** (и остальные секреты без изменений, если не требует релиз).
3. **Синк compose + образы:**  
   `cd /opt/crm && ENV_FILE=suprex/.env MANIFEST_URL='…' ./suprex/client-pull-agent.sh`  
   (или **`DEPLOYMENT_MANIFEST_PATH`** / локальный **`deployment-manifest.json`**).
4. **Поднять стек:** **`docker compose … up -d`** с **тем же** набором **`-f`**, что в **`composeFiles`** манифеста (после **`pull`** иначе новые **`backend-*`** не появятся); при смене состава — **`--remove-orphans`** по необходимости.
5. **Миграции:** если в релизе были Prisma-миграции — **`backend-migrate`** / **`prisma migrate deploy`** до **`up`** (как у вас принято).
6. **NP (0.2.6+):** ключ и отправитель — в **Settings → Nova Poshta** (БД), не только env; см. **`docs/np-module-prod.md`**. При **`backend-np`** в манифесте — **`NP_UPSTREAM_URL`** на **`backend`**.
7. **Google Drive (0.2.61+):** папка и service account — **Settings → Google-таблиця** (или env **`GOOGLE_*`** в compose).
8. **Companies (0.2.62+):** создание компании с одним именем, ответственный по умолчанию — создатель.
9. **Полный манифест (0.2.63+):** все **`compose.modules.*.yml`** + **store** — проверьте **`docker compose ps`** на **`backend-*`**; upstream URL на **`backend`** для каждого сайдкара из манифеста.
10. **OSRM (0.2.110+):** в `compose.client.yml` есть сервис **`osrm`** и у **backend** — **`OSRM_BASE_URL`**. Граф UA в **`/opt/crm/osrm-data/`** (`ukraine.osrm*`); иначе прямые линии (haversine). См. **`deploy/osrm/README.md`**, smoke: **`GET /system/routing-health`**.
11. **Миграции:** **`prisma migrate deploy`** / **`backend-migrate`** до **`up`**. **0.2.74+:** **`WAREHOUSE`**. **0.2.76+:** bank UPC/matching (`20260603120000_bank_providers_upc_matching`). **0.2.77+:** warehouse workspace / stock readiness. **0.2.78+:** updater compose service. **0.2.79+:** Kyivstar FMC, field shifts (`20260609120000_lead_source_kyivstar`). **0.2.80+:** client balances (`20260612120000_client_balance`). **0.2.81+:** notifications, addresses, discounts (3 migrations). **0.2.82:** hotfix Telegram DI. **0.2.83–0.2.84:** hotfix Prisma (не использовать). **0.2.85:** hotfix Prisma `$queryRaw` / `$transaction`. **0.2.86:** web notifications proxy + addresses UX. **0.2.87:** FX write-off (web CI failed — не использовать). **0.2.88:** FX write-off CI fix. **0.2.89:** day plan v1, NotificationsModule в core. **0.2.90:** day plan settings (`20260623120000_user_day_plan_override`). **0.2.91:** daily work agenda (`20260624120000_daily_work_plan`). **0.2.92+:** `Task.callId` (`20260624143000_task_call_id`), склады Киев/Луцьк/Хмельницький (`20260625120000_add_kyiv_lutsk_khmelnitsky_warehouses`). **0.2.93+:** новых миграций нет. **0.2.94+:** presence sessions (`20260626120000_user_activity_session`, `20260629120000_user_activity_session_app_state`). **0.2.95+:** новых миграций нет. **0.2.96+:** `TELEGRAM_MESSAGE` notification (`20260630120000_add_telegram_message_notification`). **0.2.97+:** новых миграций нет. **0.2.98+:** новых миграций нет. **0.2.99+:** новых миграций нет. **0.2.100+:** новых миграций нет. **0.2.101+:** Meta messaging inbox (`20260701120000_add_meta_messaging_inbox`); FX: `20260615120000_add_order_fx_write_off`. **0.2.102+:** field tracking events (`20260702120000_field_tracking_events`). **0.2.103+:** Telegram inbound idempotency (`20260703120000_telegram_inbound_processed_at`), message status (`20260703121000_message_status_outbox`), lead `CONVERTED` event (`20260703140000_lead_event_converted`). **0.2.104+:** fuel refuel entries (`20260706120000_fuel_refuel_entries`). **0.2.105+:** missed call queue (`20260706143000_call_queue_item_missed_call`). **0.2.106+:** новых миграций нет (fuel compensation v2 / GPS eligibility). **0.2.107+:** receivables snapshots (`20260711120000_receivables_snapshots`), push devices (`20260711140000_add_push_devices`). **0.2.108+:** Bitrix legacy debt zero (`20260713140000_zero_bitrix_legacy_debt`), planning pack/factory (`20260715160000_planning_pack_factory`). **0.2.109+:** новых миграций нет (planning BFF catch-all). **0.2.110+:** новых миграций нет (OSRM в `compose.client.yml`; нужен граф в `/opt/crm/osrm-data`). **0.2.111+:** новых миграций нет (BOM PART auto-create). **0.2.112+:** новых миграций нет (call recordings / visit GPS dual-write / OSRM match / fuel eligibility). **0.2.113+:** новых миграций нет (OSRM match sum-all / GPS vs visits sanity / nginx 50M). **0.2.114+:** field shift one ACTIVE/day (`20260720100000_field_shift_one_active_per_day`), order credit transfer (`20260720120000_order_credit_amount_transfer`). **0.2.115+:** новых миграций нет (GPS track snap/stitch, dashboard tabs, mobile API probe). **0.2.116+:** новых миграций нет (GPS fuel anti-inflation, pickup auto-ship, receivables READY_TO_SHIP+). **0.2.117+:** help center + risk module (`20260723120000_help_instruction_center`, `20260723130000_help_article_seed_revision`, `20260723140000_risk_management_module`). **0.2.118+:** новых миграций нет (Kyivstar FMC, mobile base currency, field shifts BFF). **0.2.119+:** FULLY_RETURNED stage (`20260724140000_order_stage_fully_returned`), payer alias + match audit (`20260724150000_payer_alias_and_match_audit`). **0.2.120+:** новых миграций нет (bank invoice/waybill auto-match, route plan owner guard). **0.2.121+:** новых миграций нет (hotfix backend build; образы **0.2.120** не опубликованы). **0.2.122+:** bank ignore/technical (`20260727110000_bank_tx_ignore_technical`), CreditProfile XOR (`20260727160000_credit_profile_xor`). **0.2.123+:** новых миграций нет (order PDF Cyrillic, GPS keepalive, mobile tracking health). **0.2.124+:** новых миграций нет (web scroll preserve, payments FX allocate, visits mobile UX). **0.2.125+:** новых миграций нет (bank gateway/transit guard, purpose FIO match). **0.2.126+:** новых миграций нет (UA status labels web-wide). **0.2.127+:** новых миграций нет (public Google Maps config, mobile map routing fix). **0.2.128+:** новых миграций нет (mobile Android Google Maps native key gate). **0.2.129+:** return packages (`20260730110000_return_packages`). **0.2.130+:** mis-pick returns (`20260731101500_order_return_mis_pick`). **0.2.131+:** новых миграций нет (fuel GPS partial payout, risk pickup ship gate). **0.2.132+:** return warehouse (`20260803150000_return_warehouse`), MRP extension (`20260804120000_mrp_extension`). **0.2.133+:** новых миграций нет (employee daily activity, MRP SKU calc). **0.2.140+:** новых миграций нет (MRP false PKG BOM, GPS OSRM). **0.2.139+:** company region (`20260805130000_company_region`). **0.2.138+:** новых миграций нет (mobile GPS contour, team GPS tiers). **0.2.137+:** sales history upload + soft reservation hardness (`20260804120000_sales_history_upload`, `20260804180000_soft_reservation_hardness`). **0.2.136+:** новых миграций нет (mobile GPS Android 12+ FGS). **0.2.135+:** новых миграций нет (mobile contact edit v2). **0.2.134+:** canceled order debt data fix (`20260804150000_zero_canceled_order_debt`).

## 1. Манифест (JSON)

**Где:** ответ CP (**`MANIFEST_URL`**), файл **`DEPLOYMENT_MANIFEST_PATH`**, или **`/opt/crm/deployment-manifest.json`**.

**Проверить:**

| Поле | Ожидание |
|------|----------|
| **`composeFiles`** | Непустой массив; для полного релиза **0.2.x** с модулями — не только `compose.base.yml` + `compose.client.yml`, но и **`compose.modules.*.yml`** (несколько штук). |
| **`composeFileUrls`** | Объект; **у каждого** имени из **`composeFiles`** есть строка **`https://…`**. |
| **`images`** | Есть строки с ролями **`module`** / **`module_outbound`** / **`store`** и тегами **`…:ВАША_ВЕРСИЯ`** (для текущего патча — **`0.2.140`**). |
| **`moduleCodes`** | Содержит **`core.crm`** и коды модулей (**`ext.voice_outbound`**, **`int.google_sheet`**, …), если модули заявлены в релизе. |

Если **`composeFiles`** короткий — проблема на стороне CP (сохранение/отдача манифеста) или устаревший JSON; см. **`docs/cp-v0.2.3.md`**.

## 2. Файлы на диске

**Где:** корень bundle, например **`/opt/crm/`**.

**Проверить:**

```bash
cd /opt/crm
# все пути из манифеста (нужен jq) — для полного 0.2.x обычно 16 файлов:
MANIFEST="${MANIFEST:-deployment-manifest.json}"
jq -r '.composeFiles[]' "$MANIFEST" | while read -r f; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done
```

Без **`jq`:** вручную пройдите каждый элемент **`composeFiles`** из JSON. Для каждого пути файл должен существовать (после **`client-pull-agent`** или **`git pull`**).

## 3. Переменные `.env`

**Где:** **`suprex/.env`** (или путь из **`ENV_FILE`**).

**Проверить:**

- **`BACKEND_VERSION`**, **`WEB_VERSION`**, **`STORE_VERSION`** — совпадают с релизом в registry (целевой патч линии **0.2.x**, сейчас **`0.2.140`**).
- При необходимости имена образов модулей (**`*_MODULE_IMAGE_NAME`**) — см. соответствующие **`compose.modules.*.yml`**.

## 4. Docker: тот же набор `-f`, что в манифесте

**Где:** та же машина, где крутится стек.

**Проверить:** список сервисов после **pull + up** (порядок **`-f`** должен совпадать с **`composeFiles`** в манифесте):

```bash
cd /opt/crm
# реальный список -f — из composeFiles манифеста (ниже только иллюстрация двух файлов):
docker compose -f compose.base.yml -f compose.client.yml --env-file suprex/.env config --services
docker compose … --env-file suprex/.env ps
```

**Ожидание:** для включённых в compose модулях есть сервисы вроде **`backend-outbound`**, **`backend-google-sheet`**, … Если их **нет** — вы не делали **`up -d`** с полным набором overlay или в манифесте нет их **`compose.modules.*`**.

Важно: **`docker compose pull`** сам по себе **не создаёт** новые сервисы; после pull нужен **`up -d`** с теми же **`-f`**.

## 5. Лицензия и гейтинг (если «модуля нет» в UI / 404)

**Где:** **`license.json`** (путь из **`LICENSE_FILE_PATH`** / mount в compose), переменная **`MODULE_GATING_ENABLED`** в env, настройки модулей в БД.

**Проверить:**

- В **`license.json`** есть нужные **`moduleCodes`** / расширения (например **`ext.finance`**), файл не протух и подписан.
- **`MODULE_GATING_ENABLED`**: при **`true`** доступ к маршрутам зависит от enabled в БД — см. **`README.md`** (модульность / gating).

## 6. Агент

**Где:** **`./suprex/client-pull-agent.sh`** из **`/opt/crm`**.

**Проверить:** запуск с **`MANIFEST_URL`** (или путём к JSON), без ошибок про отсутствующие compose; при отладке только compose: **`SKIP_DOCKER_PULL=1`**.

Детали вызова: **`docs/RELEASING.md`**, **`suprex/README.md`**.

## Быстрая диагностика

1. Манифест: полный **`composeFiles`** + **`composeFileUrls`**?  
2. На диске: все эти yaml есть?  
3. **`docker compose ps`**: есть **`backend-*`** модулей?  
4. После rollout: **`GET /system/modules`** (или эквивалент в вашем BFF) — ожидаемый набор enabled / entitlements.  
5. Если контейнеры есть, а API «без модуля» → **`license.json`** + **`MODULE_GATING_ENABLED`**.
