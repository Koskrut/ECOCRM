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
- `apps/web` — Web UI
- `docs/` — документация проекта

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

**Переменные окружения (backend):**

- `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка для проверки запросов webhook (заголовок `X-Telegram-Bot-Api-Secret-Token`)
- `PUBLIC_BASE_URL` — публичный URL backend для установки webhook (например `https://api.example.com`)
- `TELEGRAM_LEAD_COMPANY_ID` (опционально) — id компании для новых лидов из Telegram; если не задан, берётся первая компания в БД

**Установка webhook:** после деплоя вызвать Telegram API:

```http
POST https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook
Content-Type: application/json

{"url": "<PUBLIC_BASE_URL>/integrations/telegram/webhook", "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"}
```

**Локальная разработка:** использовать ngrok или cloudflared, задать `PUBLIC_BASE_URL` на туннель и установить webhook на `https://<tunnel>/integrations/telegram/webhook`.

## Деплой на Netcup (Docker + GitHub Actions)

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

Проверка: сервисы слушают только localhost (3000 — web, 3001 — backend, 3002 — store). Доступ снаружи — через nginx/caddy с SSL (прокси на `127.0.0.1:3000`, `127.0.0.1:3001`, `127.0.0.1:3002`).

### 4. (Опционально) Nginx как reverse proxy

Установка nginx и простой конфиг для одного домена (CRM + store на поддомене):

```bash
apt-get install -y nginx
```

Сайт для CRM (замени `crm.example.com` и пути на свои):

```nginx
# /etc/nginx/sites-available/crm
server {
    listen 80;
    server_name crm.example.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}

server {
    listen 80;
    server_name store.example.com;
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Дальше — SSL через `certbot --nginx` и при необходимости прокси для API (`api.example.com` → `127.0.0.1:3001`).
