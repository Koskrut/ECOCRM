# Установка bio3ua (core-only)

Цель: чистая БД, только **core CRM** (Postgres + migrate + API + web), **без** `crm-store`, **без** optional module compose overlays, пустой список включённых модулей и лицензия только на starter/core.

## 1. Подготовка `.env`

```bash
cp .env.base.example .env
cat .env.client.example >> .env
```

Обязательно задайте:

- `POSTGRES_PASSWORD`, `JWT_SECRET`
- `BACKEND_VERSION`, `WEB_VERSION` (теги образов из GHCR)
- `BACKEND_IMAGE_NAME=crm-core-api` — образ **core-only** (`Dockerfile` target `core-runner`); в манифесте CP это отдельная строка с ролью **`other`**, `serviceName: crm-core-api`, digest **`CORE_DIGEST`**
- `CORS_ORIGIN`, `PUBLIC_BASE_URL` (как в `.env.client.example`)

Не подключайте `compose.modules.store.yml` и другие `compose.modules.*`, если магазин и модули не нужны.

## 2. Всё через Control Plane (узкий контур)

Ниже — порядок, когда **образы и дайджесты** живут в GHCR, **подписка и установка** — в CP, на сервере **только core** (`crm-core-api` + web), **без** `compose.modules.*`.

1. **Релиз в registry** — в GitHub Actions успешно прошёл **Publish Registry Release** на нужный тег; в CP виден релиз с образами `crm-core-api` (роль **`other`**, `serviceName: crm-core-api`) и `crm-web`.
2. **Объект в CP** — клиент / **installation** для bio3ua, подписка **только на `core.crm`** (без extension-модулей в entitlements).
3. **Переменные в `.env`** (попадают в `backend` из `compose.client.yml`):
   - `CONTROL_PLANE_URL` — URL CP без завершающего `/`;
   - `CONTROL_PLANE_INSTALLATION_ID`;
   - `CONTROL_PLANE_INSTALLATION_TOKEN` (или задайте `CONTROL_PLANE_TOKEN`; в compose токен по умолчанию подставляется из installation token, см. комментарии в `compose.client.yml`).
4. **Подписанная лицензия** — backend по-прежнему читает модули из **`FileLicenseStateProvider`**: файл **`license.json`** на хосте → `LICENSE_FILE_PATH_HOST`, в контейнере путь `LICENSE_FILE_PATH`, плюс **`LICENSE_PUBLIC_KEY`** (или PEM), которые выдаёт CP. Без валидного файла расширения остаются **unlicensed**, даже если phone-home в CP «зелёный».
5. **Образ API** — `BACKEND_IMAGE_NAME=crm-core-api`, `BACKEND_VERSION` = тегу, согласованному с CP/манифестом.
6. **Compose** — только `-f compose.base.yml -f compose.client.yml` (ни store, ни module sidecars).
7. **Запуск** — `pull` и `up -d` как в §4.
8. **Проверка CP-связи** — под ADMIN: `GET /system/control-plane` или страница **`/settings/health`** (режим CP, installation id, последний phone-home без утечки секретов).
9. **Pilot** — список enabled через UI или `PUT /system/modules/enabled` **в рамках SKU** (для чистого core — только `core.crm` или пусто по вашей политике).

## 3. Чистая база

На новом сервере достаточно первого `up` (создаётся volume Postgres). Если нужно **обнулить** данные:

```bash
docker compose -f compose.base.yml -f compose.client.yml --env-file .env down -v
```

Убедитесь, что удаляется нужный volume (`POSTGRES_DATA_VOLUME` в `.env`).

## 4. Запуск стека

```bash
docker compose -f compose.base.yml -f compose.client.yml --env-file .env pull
docker compose -f compose.base.yml -f compose.client.yml --env-file .env up -d
```

Сервисы: `postgres`, `backend-migrate`, `backend` (crm-core-api), `web`.

## 5. Модули и лицензия

- **Control Plane / подписка:** только starter / `core.crm` (без entitlements на extension-модули).
- **Файл лицензии** (`license.json`): payload с перечнем модулей должен соответствовать подписке; для core-only — без extension ids (или только то, что реально выдано CP).
- **`modules_enabled_v1`** в БД (настройка CRM): `{ "enabled": [] }` или только `core.crm`, чтобы extension-модули не были **enabled**.

Проверка:

```bash
curl -sS -H "Authorization: Bearer <admin_jwt>" http://127.0.0.1:3001/system/modules | jq
```

Ожидаемо: non-core модули с `installed: false` / `effective: false` при `BACKEND_VARIANT=core` в образе `crm-core-api`.

## 6. Внутренний доступ core ↔ modules (далее)

Черновой контракт: см. [`module-internal-auth.md`](module-internal-auth.md) (`MODULE_INTERNAL_SECRET`). На core-only установке эти переменные **не обязательны**.

## 7. Outbound как отдельный контейнер (опционально)

Если подключаете `crm-module-outbound`:

- Добавьте `-f compose.modules.outbound.yml -f compose.modules.outbound-sidecar.yml`
- Задайте `OUTBOUND_MODULE_IMAGE_NAME=crm-module-outbound` и ту же `BACKEND_VERSION`, что у опубликованного module image
- На сервисе **`backend`** при работающем `backend-outbound` задайте **`OUTBOUND_CRON_DISABLED=true`**, чтобы не дублировать outbound cron
- При образе **`crm-core-api`** задайте **`OUTBOUND_UPSTREAM_URL=http://backend-outbound:3001`**, чтобы web продолжал ходить в один `API_URL`, а core проксировал `/outbound` и `/integrations/outbound-voice` на модуль (см. [`module-internal-auth.md`](module-internal-auth.md))

## 8. Пример `client_extension` (bio3ua)

Шаблон отдельного процесса клиента (не CRM backend): [`apps/crm-client-bio3ua`](../apps/crm-client-bio3ua) — NestJS с `GET /health`, порт по умолчанию `3010`.

В **deployment manifest** для Control Plane добавьте образ с:

- `role: client_extension`
- **`clientCode`**: например `bio3ua` (идентификатор клиента в CP)
- опционально `moduleCode` (если ваш CP требует строку кода для всех не-core ролей)
- `imageRepository` / `imageTag` / `imageDigest` как у остальных образов

Сборка Docker:

```bash
docker build -t ghcr.io/<namespace>/crm-client-bio3ua:${BACKEND_VERSION} ./apps/crm-client-bio3ua
```

Это **не** часть `compose.base.yml` / `compose.client.yml` по умолчанию: подключайте отдельный compose или сервис только если CP/rollout выдаёт такой overlay для конкретной инсталляции.
