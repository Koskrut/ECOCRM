# Contact card v2 — rollout (план §19)

## Прапорі

1. **Build-time:** `NEXT_PUBLIC_CONTACT_CARD_V2` у `apps/web` (за замовчуванням увімкнено, вимкнення: `false`).
2. **Runtime (БД):** `SystemSetting` з `id: contact_card_ui`, JSON `{ "contactCardV2": true | false }`. Якщо запису немає — вважається **true**.
   - `GET /settings/contact-card-ui` — читання (будь-який автентифікований користувач).
   - `PATCH /settings/contact-card-ui` — лише **ADMIN**.

Web UI для runtime-прапора: `apps/web/src/app/settings/contact-card-ui/page.tsx`.
Після `PATCH` фронтенд скидає локальний кеш і розсилає invalidation-event, щоб відкриті вкладки CRM перевитягнули прапор.

## Метрики / логи

`ContactsService.getCard()` пише structured logs у форматі JSON з `event = "contact_card_get"`.

### Успіх

```json
{
  "event": "contact_card_get",
  "outcome": "ok",
  "statusCode": 200,
  "contactId": "…",
  "actorId": "…",
  "role": "MANAGER",
  "durationMs": 42,
  "canonicalTotal": 7,
  "canonicalVisibleCount": 5,
  "legacyTotal": 2,
  "companyTotal": 3,
  "partialData": true
}
```

### Помилка / 403

```json
{
  "event": "contact_card_get",
  "outcome": "forbidden",
  "statusCode": 403,
  "contactId": "…",
  "actorId": "…",
  "role": "MANAGER",
  "durationMs": 9,
  "errorMessage": "You can only access contacts assigned to you"
}
```

Що будувати в log aggregation:

- latency / p95: `event = contact_card_get`, агрегувати по `durationMs`
- error rate: `event = contact_card_get AND outcome != ok`
- доля `403`: `event = contact_card_get AND statusCode = 403`
- partial-data rate: `event = contact_card_get AND partialData = true`

## Fallback при помилці card API

Модалка показує банер помилки KPI; профіль контакта з `GET /contacts/:id` лишається доступним. Повне відключення v2 — через env або `contactCardV2: false` у БД (після підключення UI до API).
