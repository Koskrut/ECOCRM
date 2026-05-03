# Customer success — onboarding & support

## Швидкий старт (guided)

1. **Health**: `/settings/health` — release, license, modules, Control Plane telemetry.
2. **Користувачі та ролі**: базові ролі з RBAC; кастомні ролі — `/settings/metadata/rbac`.
3. **Metadata**: поля, словники, layouts — `/settings/metadata/*`.
4. **Імпорт**: `/settings/data-import` — job: upload → validate → commit.
5. **Custom entities**: визначення + `/custom-data/{key}` для записів.

## Шаблони (presets)

Рекомендовані пресети (B2B services / retail / production) — завести як seed JSON або окремий «tenant template» пакет у майбутньому; зараз використовуйте:

- Спільні `dictionaries` (канали, регіони, причини відмови).
- `layouts` типу CARD для CONTACT/LEAD.
- `workflows` на RECORD_CREATED для нотифікацій (webhook / task).

## Support diagnostics bundle

Для тикета підтримки зібрати (без секретів):

- Вивід `/settings/health` (ADMIN).
- Останні `data-import` jobs (`GET /data-import/jobs`).
- Версія з `GET /system/version` (публічно).

## SLA (чернетка)

- **P1** — CRM недоступна: перевірити деплой, БД, логи backend.
- **P2** — модуль інтеграції: `GET /system/modules`, effective flags.
