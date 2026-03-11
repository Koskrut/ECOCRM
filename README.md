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
- Создай на сервере файл `.env` в корне репо (рядом с `docker-compose.prod.yml`). Минимум:
  - `POSTGRES_PASSWORD` — пароль БД PostgreSQL.
  - Все переменные из `apps/backend/.env.example` (в т.ч. `DATABASE_URL` можно не задавать — compose подставит свой от postgres).
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
