# Changelog

Все значимые изменения монорепозитория фиксируются здесь (кратко). Детали модульности — `docs/CRM-modularity-structure.md`, статус фаз — `docs/module-split-progress.md`.

## Unreleased

_(планируемые изменения после **0.2.0**.)_

## [0.2.0] — 2026-05-13

### Summary

Минорный релиз **0.2.0**: линия поставки **0.2.x**. В **Publish Registry Release** для версий **`0.2.*`** при **пустом** поле **modules** (в т.ч. при push тега `v0.2.*`, когда inputs нет) CI собирает **все** опциональные module-образы: outbound, google-sheet, ringostat, bitrix, np, finance, planning. Для **`0.1.*`** пустой CSV по-прежнему означает «без отдельных module-образов». Манифест для Control Plane получает **`compatibility.line`** вида **`M.m.x`** из версии релиза (например `0.2.x` для `0.2.0`). В образы входит код на момент тега/запуска workflow.

### Changed

- **CI / релиз**: `publish-release.yml` — при версии `0.2.*` и пустом CSV **modules** собираются все optional module images; `compatibility.line` в `deployment-manifest.json` выводится из semver (`0.2.x`, `0.1.x`, …).
- **Версии пакетов**: `apps/backend`, `apps/web`, `apps/store` → `0.2.0`.
- **Документация**: `README.md`, `docs/RELEASING.md`, `docs/git-release-workflow.md`, `.env.base.example` — линия **0.2.x** и примеры версий образов.

### Upgrade notes

- Клиентам на **0.1.x**: переход на **0.2.0** — минорный bump; сверить **compose**, **`.env`**, **миграции Prisma**, **license.json** / пилоты и **`MODULE_GATING_ENABLED`**. Patch-совместимость внутри **0.2.x** — по правилам в `README.md`.

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
