# Changelog

Все значимые изменения монорепозитория фиксируются здесь (кратко). Детали модульности — `docs/CRM-modularity-structure.md`, статус фаз — `docs/module-split-progress.md`.

## Unreleased

_(готовится **0.1.6**; образы **0.1.5** уже в registry.)_

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
