# CRM (Monorepo)

Монорепозиторий CRM:

- **apps/backend** — Backend API на NestJS + Prisma + PostgreSQL
- **apps/web** — Web UI на Next.js

## Зачем проект

CRM для команды продаж и операций:

- клиенты/компании/контакты
- заказы/сделки
- интеграция доставки **Nova Poshta** (создание ТТН, хранение нескольких ТТН для частичных отгрузок)
- обновление статусов доставки по крону
- подготовка базы для оплат и отчетности

## Стек

- Node.js
- Backend: NestJS, Prisma, PostgreSQL
- Frontend: Next.js, React, Tailwind, ESLint

## Структура репозитория

- `apps/backend` — API
- `apps/mobile` — кроссплатформенное приложение для менеджеров (Expo / React Native)
- `apps/web` — Web UI
- `docs/` — документация проекта (в т.ч. [`docs/bio3ua-core-only.md`](docs/bio3ua-core-only.md), [`docs/module-internal-auth.md`](docs/module-internal-auth.md), [**мобильное приложение для менеджеров (визиты, GPS, топливо)**](docs/mobile-manager-app/README.md), [**релиз в Git**](docs/RELEASING.md), [workflow тегов и CI](docs/git-release-workflow.md))

## Требования

- Node.js **>= 20**
- PostgreSQL **>= 14**
- npm (идёт вместе с Node)

## Установка

```bash
npm install
```

## Локальная разработка (web и store)

Если на машине уже запускали стек Docker (`docker compose -f docker-compose.prod.yml up`), контейнеры **web** и **store** занимают порты **3000** и **3002**. Тогда локальные `npm run dev:web` и `npm run dev:store` не стартуют (порт занят).

**Чтобы запускать фронт локально**, освободи порты — останови только эти контейнеры:

```bash
docker stop crm-web-1 crm-store-1
```

(Имена могут отличаться, проверь: `docker ps` и найди контейнеры по образам `crm-web`, `crm-store`.)

Дальше как раньше: в отдельных терминалах `npm run dev:backend`, `npm run dev:web`, `npm run dev:store`. Для полного стека в Docker снова: `docker compose -f docker-compose.prod.yml up -d`.

## Интеграция Telegram

Канал общения с клиентами через Telegram-бота: клиенты пишут в бота, диалоги и сообщения хранятся в CRM, ответы отправляются из Inbox в web.

## Workflow Runtime V1

Workflow runtime пока использует in-memory rate limit для защиты от повторных выполнений правил: `10` executions на пару `(rule_id, entity_id)` в rolling 1-hour window. Это подходит только для single-instance backend. Для multi-instance deployment этот guardrail нужно перенести в Redis, чтобы лимиты были общими для всех replicas.

Workflow в текущей версии поддерживает изменение полей, назначение ответственных и создание задач. Уведомления (email, Telegram, webhook) появятся в следующей версии.

**Переменные окружения (backend):**

- `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка для проверки запросов webhook (заголовок `X-Telegram-Bot-Api-Secret-Token`)
- `PUBLIC_BASE_URL` — публичный URL backend для установки webhook (например `https://api.example.com`)
- `TELEGRAM_LEAD_COMPANY_ID` (опционально) — id компании для новых лидов из Telegram; если не задан, берётся первая компания в БД

**Установка webhook (рекомендуемый способ):** в CRM открыть Настройки → Telegram, сохранить токен бота, webhook secret и public base URL, затем нажать «Register webhook». Кнопка «Check status» показывает `getWebhookInfo` (URL, pending updates, последняя ошибка) для диагностики.

**Установка webhook вручную (альтернатива):** вызвать Telegram API напрямую:

```http
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
Content-Type: application/json

{"url": "<PUBLIC_BASE_URL>/integrations/telegram/webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}
```

**Локальная разработка:** использовать ngrok или cloudflared, задать `PUBLIC_BASE_URL` на туннель и установить webhook на `https://<tunnel>/integrations/telegram/webhook`.

## Production deployment via registry images

Новая production-модель использует заранее собранные registry images из GHCR и `compose.base.yml`. Старый `docker-compose.prod.yml` пока остаётся для совместимости, но больше не является целевым способом доставки.

### Prerequisites

- Docker Engine 24+ и Docker Compose Plugin.
- Доступ к GHCR: `docker login ghcr.io -u koskrut`.
- Backup текущей PostgreSQL БД перед обновлением работающего клиента.
- `.env` на сервере, созданный из `.env.base.example` и `.env.client.example`.

### Setup

```bash
cp .env.base.example .env
cat .env.client.example >> .env
# заполни POSTGRES_PASSWORD, JWT_SECRET, public URLs, license path/key и версии образов

docker compose -f compose.base.yml -f compose.client.yml --env-file .env pull
docker compose -f compose.base.yml -f compose.client.yml --env-file .env up -d
```

`backend-migrate` запускается как отдельный one-off service перед backend. Сам backend container не выполняет миграции в entrypoint.
`compose.client.yml` публикует порты только на `127.0.0.1` по умолчанию; внешний HTTPS/reverse proxy настраивается отдельно.

**Интернет-магазин (`crm-store`):** по умолчанию в `compose.base.yml` нет сервиса `store`. Без манифеста CP подключите overlay после `compose.client.yml`:

```bash
docker compose -f compose.base.yml -f compose.client.yml -f compose.modules.store.yml --env-file .env up -d
```

Манифест релиза из CI (**Publish Registry Release**) для Control Plane включает **`compose.base.yml`**, **`compose.client.yml`**, **`compose.modules.store.yml`** и overlays опциональных модулей по версии релиза (для **`0.2.x`** с пустым `modules` в workflow — полный набор модулей). Ручной минимальный стек без магазина — только два первых `-f`.

### Module overlays

D3 overlays подключают in-process модули через конфигурацию `crm-backend-core`. Первый **отдельный** module image: `crm-module-outbound` (`Dockerfile` target `outbound-runner`) + `compose.modules.outbound-sidecar.yml` (сервис `backend-outbound`). Чтобы не дублировать cron, на `backend` задайте `OUTBOUND_CRON_DISABLED=true`, пока живёт `backend-outbound`.

**Установка bio3ua core-only** (без store, пустой enabled list, чистая БД): см. [`docs/bio3ua-core-only.md`](docs/bio3ua-core-only.md).

**Один origin для UI:** при `crm-core-api` + `backend-outbound` задайте на core `OUTBOUND_UPSTREAM_URL=http://backend-outbound:3001` — тогда `/outbound` и `/integrations/outbound-voice` проксируются на модуль (см. [`docs/module-internal-auth.md`](docs/module-internal-auth.md)).

```bash
# Outbound / AI calls (env на monolith backend)
docker compose -f compose.base.yml -f compose.modules.outbound.yml -f compose.client.yml --env-file .env up -d

# Outbound как отдельный контейнер (module image + sidecar)
# На backend: OUTBOUND_CRON_DISABLED=true в .env
docker compose \
  -f compose.base.yml \
  -f compose.modules.outbound.yml \
  -f compose.modules.outbound-sidecar.yml \
  -f compose.client.yml \
  --env-file .env up -d

# Integrations: Telegram, Nova Poshta, Google Sheet, Bitrix, Ringostat
docker compose -f compose.base.yml -f compose.modules.integrations.yml -f compose.client.yml --env-file .env up -d

# Finance
docker compose -f compose.base.yml -f compose.modules.finance.yml -f compose.client.yml --env-file .env up -d

# Full enterprise-style stack (добавь compose.modules.store.yml перед up, если нужен интернет-магазин)
docker compose \
  -f compose.base.yml \
  -f compose.modules.outbound.yml \
  -f compose.modules.integrations.yml \
  -f compose.modules.finance.yml \
  -f compose.modules.production-planning.yml \
  -f compose.client.yml \
  --env-file .env up -d
```

`MODULE_GATING_ENABLED` задаётся в `.env` / `compose.base.yml` (см. `MODULE_GATING_ENABLED`); выставьте `"true"` только после того, как все non-core маршруты закрыты `@RequireModule`. Effective module access зависит от лицензии и pilot/modules в БД.

### Verify

```bash
docker compose -f compose.base.yml -f compose.client.yml --env-file .env ps
docker compose -f compose.base.yml -f compose.client.yml --env-file .env exec backend wget -O- http://localhost:3001/system/version
```

Ответ `/system/version` должен содержать `version`, `commitSha`, `builtAt` и `nodeEnv`.

### Typical configurations

Minimal core:

```bash
docker compose -f compose.base.yml -f compose.client.yml --env-file .env up -d
```

CRM with Telegram/Nova Poshta/integration features:

```bash
docker compose \
  -f compose.base.yml \
  -f compose.modules.integrations.yml \
  -f compose.client.yml \
  --env-file .env up -d
```

Full enterprise-style configuration:

```bash
docker compose \
  -f compose.base.yml \
  -f compose.modules.outbound.yml \
  -f compose.modules.integrations.yml \
  -f compose.modules.finance.yml \
  -f compose.modules.production-planning.yml \
  -f compose.modules.store.yml \
  -f compose.client.yml \
  --env-file .env up -d
```

### Updating versions

1. Измени `BACKEND_VERSION`, `WEB_VERSION` или `STORE_VERSION` в `.env`.
2. Загрузи новые images:
   ```bash
   docker compose -f compose.base.yml -f compose.client.yml --env-file .env pull
   ```
3. Перезапусти нужные сервисы:
   ```bash
   docker compose -f compose.base.yml -f compose.client.yml -f compose.modules.store.yml --env-file .env up -d backend web store
   ```
   (без магазина опусти `-f compose.modules.store.yml` и сервис `store`.)

### Rollback

1. Верни предыдущий tag в `.env`, например `BACKEND_VERSION=0.1.19`.
2. Pull старого image и перезапусти сервис:
   ```bash
   docker compose -f compose.base.yml -f compose.client.yml --env-file .env pull backend
   docker compose -f compose.base.yml -f compose.client.yml --env-file .env up -d backend
   ```
3. Если rollback затрагивает БД-миграции, сначала восстанови PostgreSQL backup. Автоматического down-migrate нет.

### Compatibility window

Текущая линия поставки registry: **`0.2.x`**. Для продакшена рекомендуется актуальный patch (**`0.2.116`**; см. `CHANGELOG.md`). Линия **`0.1.x`** остаётся для уже развёрнутых клиентов до перехода на `0.2.x`.

| Component | Compatible versions |
| --- | --- |
| `crm-backend-core` | `0.2.x` (новые релизы); `0.1.x` (наследие) |
| `crm-web` | `0.2.x`; `0.1.x` |
| `crm-store` | `0.2.x`; `0.1.x` |
| `compose.base.yml` | та же минор-линия, что и образы |
| `compose.client.yml` | та же минор-линия, что и образы |
| `compose.modules.*.yml` | та же минор-линия, что и образы |

Правила совместимости:

- Patch releases внутри одной минор-линии (`0.2.x`, ранее `0.1.x`) считаются совместимыми между core/web/store и compose files.
- Minor bump (`0.1.x` → `0.2.0`) требует review compose/env/migrations и лицензии перед обновлением клиента.
- D3 module overlays пока являются config overlays для in-process modules внутри `crm-backend-core`, а не отдельными `crm-module-*` images.
- Rollback image tag безопасен только если применённые DB migrations совместимы назад. Если migration уже изменила данные или схему несовместимо, rollback начинается с восстановления PostgreSQL backup.
- `v1.0.0` зарезервирован для первого платного production-клиента.

### Migration from docker-compose.prod.yml

`docker-compose.prod.yml` остаётся deprecated compatibility entrypoint до проверки новой модели на реальном окружении. Для перехода:

1. Сделай backup БД старого стека:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env exec postgres pg_dump -U crm -d crm -Fc > crm-before-registry.dump
   ```
2. Останови legacy stack:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env down
   ```
3. Подготовь `.env` для registry stack из `.env.base.example` + `.env.client.example`; выставь те же домены, secrets, license path и нужные module env.
4. Запусти новый stack с нужными overlays:
   ```bash
   docker compose -f compose.base.yml -f compose.client.yml --env-file .env up -d
   ```
5. Если используется новый volume, восстанови backup в PostgreSQL до запуска backend или в maintenance window.
6. Проверь `/system/version`, health, license status и ключевые пользовательские сценарии.

Не запускай legacy и registry stacks одновременно против одной и той же БД.

## Деплой на Netcup (Docker + GitHub Actions) — DEPRECATED

Этот раздел описывает legacy build-on-server модель через `docker-compose.prod.yml`. Она остаётся рабочей до стабилизации registry-based delivery, но будет удалена после проверки новой модели на реальном окружении.

Деплой по `git push` в `main`: на VPS поднимается стек из `docker-compose.prod.yml` (PostgreSQL, backend, web, store).

### 1. Подготовка VPS (один раз)

- Установи Docker и Docker Compose Plugin на сервер (см. [официальную инструкцию](https://docs.docker.com/engine/install/)).
- Создай каталог и клонируй репозиторий:
  ```bash
  sudo mkdir -p /opt/crm && sudo chown $USER /opt/crm
  git clone https://github.com/<user>/<repo>.git /opt/crm
  cd /opt/crm
  ```
- Создай на сервере файл `.env` **в корне репо** (рядом с `docker-compose.prod.yml`). Только переменные окружения (строки вида `KEY=value`), без вставки YAML из docker-compose. Минимум:
  - `POSTGRES_PASSWORD` — пароль БД PostgreSQL.
  - Остальное по образцу `apps/backend/.env.example` или корневого `.env.production.example`. `DATABASE_URL` в .env можно не задавать — compose подставит свою строку для контейнера backend.
  - Для прода: `CORS_ORIGIN=https://твой-домен.ru,https://store.твой-домен.ru` и т.п.
- Первый запуск вручную:
  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env up -d --build
  ```

### 2. Секреты GitHub

В репозитории: **Settings → Secrets and variables → Actions** добавь:

| Secret            | Описание                          |
|-------------------|-----------------------------------|
| `SSH_PRIVATE_KEY` | Приватный SSH-ключ для доступа к VPS |
| `SERVER_HOST`     | IP или домен сервера Netcup       |
| `SERVER_USER`     | Пользователь SSH (например `root`) |
| `SERVER_PORT`     | (опционально) Порт SSH, по умолчанию 22 |
| `DEPLOY_PATH`     | (опционально) Каталог на сервере, по умолчанию `/opt/crm` |

После каждого пуша в ветку `main` workflow выполнит на сервере `git pull` и `docker compose ... up -d --build`.

### Запуск одноразовых скриптов на проде (Bitrix-импорт и т.п.)

**Вариант A — импорт на том же сервере, где CRM:** запускай внутри контейнера backend (там уже правильный `DATABASE_URL` с хостом `postgres`):

```bash
docker compose -f docker-compose.prod.yml exec backend npm run bitrix:import
```

**Вариант B — импорт с другого хоста** (импорт на 159.159.31.153, CRM и Bitrix MySQL на 144.76.233.11). В `apps/backend/.env` на машине, где запускаешь импорт (159.159.31.153), укажи:

- **CRM (PostgreSQL):** `DATABASE_URL=postgresql://crm:ПАРОЛЬ_БД@144.76.233.11:5432/crm` (на 144.76.233.11 в compose порт 5432 проброшен).
- **Bitrix MySQL** (источник данных на 144.76.233.11):
  - Если MySQL на 144.76.233.11 доступен по сети (порт 3306 открыт):  
    `BITRIX_MYSQL_HOST=144.76.233.11`, `BITRIX_MYSQL_PORT=3306`, `BITRIX_MYSQL_USER`, `BITRIX_MYSQL_PASSWORD`, `BITRIX_MYSQL_DATABASE`.
  - Если MySQL слушает только localhost на 144.76.233.11 — туннель с хоста, где запускаешь импорт:  
    `ssh -L 3307:127.0.0.1:3306 root@144.76.233.11` (держать в фоне), затем в `.env`:  
    `BITRIX_MYSQL_HOST=127.0.0.1`, `BITRIX_MYSQL_PORT=3307`, `BITRIX_MYSQL_USER`, `BITRIX_MYSQL_PASSWORD`, `BITRIX_MYSQL_DATABASE`.

Доступ к 5432 на 144.76.233.11 лучше ограничить файрволом (например только с 159.159.31.153).

---

## Быстрый деплой на чистый VPS (Ubuntu, без Docker)

Если на сервере ещё нет Docker, установи его и запусти стек вручную.

### 1. Установка Docker на Ubuntu 24.04

```bash
apt-get update && apt-get install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a644 /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
docker --version && docker compose version
```

### 2. Клонирование и настройка

```bash
mkdir -p /opt/crm && cd /opt/crm
git clone https://github.com/<user>/<repo>.git .
```

Создай в `/opt/crm` файл `.env` (рядом с `docker-compose.prod.yml`). Минимум:

- `POSTGRES_PASSWORD` — надёжный пароль для PostgreSQL.
- Переменные из `apps/backend/.env.example`: `JWT_SECRET`, `DATABASE_URL` можно не ставить (compose подставит свою строку), остальное по необходимости (Nova Poshta, CORS и т.д.).
- Для продакшена: `CORS_ORIGIN=https://твой-домен.ru,https://store.твой-домен.ru`.

Пример минимального `.env`:

```env
POSTGRES_PASSWORD=сложный_пароль_для_бд
JWT_SECRET=длинная_случайная_строка
CORS_ORIGIN=https://crm.example.com,https://store.example.com
NP_API_KEY=твой_ключ_новой_почты
NP_SENDER_CITY_REF=...
NP_SENDER_WAREHOUSE_REF=...
NP_SENDER_FIRST_NAME=...
NP_SENDER_LAST_NAME=...
NP_SENDER_PHONE=...
```

### 3. Запуск

```bash
cd /opt/crm
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Проверка: сервисы слушают только localhost (3000 — web, 3001 — backend, 3002 — store). Доступ снаружи — через nginx/caddy с SSL (прокси на `localhost:3000`, `localhost:3001`, `localhost:3002`).

### 4. (Опционально) Nginx как reverse proxy

Установка nginx и простой конфиг для одного домена (CRM + store на поддомене):

```bash
apt-get install -y nginx
```

Сайт для CRM (замени `crm.example.com` и пути на свои):

```nginx
# /etc/nginx/sites-available/crm
# Do NOT set Connection 'upgrade' on every request — only for real WebSocket locations.
# See deploy/nginx/suprex.dental.conf and deploy/nginx/README.md.
server {
    listen 80;
    server_name crm.example.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name store.example.com;
    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Дальше — SSL через `certbot --nginx` и при необходимости прокси для API (`api.example.com` → `localhost:3001`).
