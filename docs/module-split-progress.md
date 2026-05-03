# Module split — прогресс (снимок для плана)

Файл синхронизирует **Definition of Done** из плана модульного разбиения с репозиторием. Плановый YAML в чате/доке может отставать; здесь — краткий статус по фазам.

| Фаза / тема | Статус | Примечание |
|-------------|--------|------------|
| Phase 0: generic proxies, `*_CRON_DISABLED`, `BACKEND_VARIANT`, `ModuleHealthService`, manifest `moduleCode`, CI `modules` CSV | Done | См. `docs/CRM-modularity-structure.md` |
| Wave A–D: sidecar images, compose `compose.modules.*-sidecar.yml`, Dockerfile targets, прокси upstream | Done | Отдельные entrypoints `*-main.ts` |
| Phase 5: `crm-client-bio3ua`, `docs/bio3ua-core-only.md` | Done | |
| Finance idempotency (`Idempotency-Key`, Prisma `FinanceIdempotencyRecord`, interceptor) | Done | Тесты: `apps/backend/src/finance-idempotency/__tests__/*.spec.ts` |
| Smoke «full sidecar stack» | Done | `scripts/smoke-sidecar-stack.sh` (`config` / `up` / `smoke` / `down`); внутри контейнеров — `wget /system/version`; с хоста — `SMOKE_PUBLIC_BACKEND=1` + `curl` на порт из `compose.client` (`BACKEND_PORT` / `BACKEND_BIND_ADDRESS`) |

Обновляйте эту таблицу при смене крупных вех (не обязательно на каждый PR).
