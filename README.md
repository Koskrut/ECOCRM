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
