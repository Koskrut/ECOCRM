# ECOCRM Stack & Versions (Source of Truth)

## Runtime

- Node.js: 20.x LTS (обязательно)
- npm: 10.x (допустимо) / используем npm workspaces
- OS: macOS dev, Linux prod

## Backend (apps/backend)

- Framework: NestJS
- ORM: Prisma 7.x (фиксируем minor)
- DB: PostgreSQL 16
- Auth: JWT (cookie HttpOnly `token`)
- Scheduler: @nestjs/schedule (cron jobs)
- Transport: REST JSON

## Frontend (apps/web)

- Framework: Next.js 16.x (App Router)
- Styling: Tailwind CSS (через PostCSS)
- State: (если есть) Zustand / TanStack Query (указать что реально используем)
- API: Next route handlers (/app/api/\*) как BFF proxy к backend
- Auth storage: cookie HttpOnly `token` (НЕ localStorage)

## Tooling

- TypeScript strict: ON
- Lint/format: ESLint + Prettier (фиксируем конфиги)
- Git: conventional commits + PR checklist
