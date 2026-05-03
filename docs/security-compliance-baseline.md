# Security & compliance baseline (CRM Core)

Короткий чеклист для production-ready ядра. Детали env — у клієнта в `compose.client.yml` / secret manager.

## Secrets & tokens

- Окремі токени для CI (`CONTROL_PLANE_CI_TOKEN`), installation (`CONTROL_PLANE_INSTALLATION_TOKEN`), DB, JWT secret, інтеграційні ключі.
- Ротація: план зміни JWT secret / installation token без простою (два valid періоди).
- У логах і audit — **redaction** PII (див. `audit-redaction`).

## Control Plane

- `CONTROL_PLANE_URL` + installation id/token тільки там, де потрібен phone-home; не комітити в git.
- Моніторити `GET /system/control-plane` (ADMIN): `lastSuccessAt`, `lastHttpStatus`, `lastError`.

## PII & retention

- Політика зберігання audit: періодичне очищення / архів (операційний runbook).
- Експорт / видалення даних суб'єкта — окремі процедури (GDPR-style); API ще розширюється.

## Access review

- Періодично перевіряти `ADMIN` / кастомні ролі в `/settings/metadata/rbac`.
- Вимкнені користувачі не повинні залишати активні сесії (TTL / logout).

## Incident response

- Див. `docs/core-product-runbook.md` та розділ rollback у release checklist.
