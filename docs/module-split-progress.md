# Module split — прогресс (снимок для плана)

Файл синхронизирует **Definition of Done** из плана модульного разбиения с репозиторием.  
**Полный план доведения архитектуры:** [`modular-architecture-completion-plan.md`](modular-architecture-completion-plan.md).

| Фаза / тема | Статус | Примечание |
|-------------|--------|------------|
| Phase 0: generic proxies, `*_CRON_DISABLED`, `BACKEND_VARIANT`, `ModuleHealthService`, manifest `moduleCode`, CI `modules` CSV | Done | См. `docs/CRM-modularity-structure.md` |
| Wave A–D: sidecar images, compose `compose.modules.*-sidecar.yml`, Dockerfile targets, прокси upstream | Done | Отдельные entrypoints `*-main.ts` |
| Phase 5: `crm-client-bio3ua`, `docs/bio3ua-core-only.md` | Done | |
| Finance idempotency (`Idempotency-Key`, Prisma `FinanceIdempotencyRecord`, interceptor) | Done | Тесты: `apps/backend/src/finance-idempotency/__tests__/*.spec.ts` |
| Smoke «full sidecar stack» | Partial | `scripts/smoke-sidecar-stack.sh` — health only; **нет** `kyivstar-fmc`; нет route smoke (см. completion plan фаза 3) |
| **Completion plan фаза 0** — доки, два режима деплоя | Pending | `modular-architecture-completion-plan.md` §4 |
| **Completion plan фаза 1** — ADR границы core↔module | Pending | Proxy-first + HTTP port-adapters (гибрид) |
| **Completion plan фаза 2** — `IntegrationPorts` gaps | Pending | finance, google-sheet, payment-requests дубли |
| **Completion plan фаза 3** — route smoke + тесты | Pending | |
| **Completion plan фаза 4** — sidecar prod runbook | Pending | |
| **Completion plan фаза 5** — `MODULE_INTERNAL_SECRET` на workers | Pending | опционально |
| **Completion plan фаза 6** — CP / КП | Pending | |

Обновляйте эту таблицу при смене крупных вех (не обязательно на каждый PR).
