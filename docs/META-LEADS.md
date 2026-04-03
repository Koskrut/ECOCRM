# Meta Lead Ads

Интеграция лидов из Meta Lead Ads: приём вебхука и отображение атрибуции/ответов формы в карточке лида.

## Эндпоинты

- **GET** `/leads/meta/ingest` — верификация вебхука Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`). Ответ — **plain text** `hub.challenge`. Токен должен совпадать с CRM → Settings → Facebook / Meta Lead Ads → Webhook Verify Token (или переменная `META_WEBHOOK_VERIFY_TOKEN`).
- **POST** `/leads/meta/ingest` — приём payload от Meta (Lead Ads webhook). Публичный маршрут (без JWT). Тело запроса — JSON в формате Meta (см. пример в `docs/meta-lead-sample.json`). Если задан `META_APP_SECRET`, проверяется заголовок `X-Hub-Signature-256` по сырому телу запроса. Если в payload нет `field_data`, при наличии **Page Access Token** в настройках CRM данные лида подгружаются из Graph API.
- **GET** `/leads/:id` — лид с полями `attribution`, `answers`, `events`, `identities`.
- **PATCH** `/leads/:id` — обновление лида (в т.ч. `firstName`, `lastName`, `city`, `comment`, `channel`, `ownerId`).
- **POST** `/leads/:id/note` — добавление заметки к лиду. Тело: `{ "message": "текст заметки" }`.
- **PATCH** `/leads/:id/status` — смена статуса (в т.ч. `WON`, `LOST`, `SPAM`).

## Пример: отправка тестового лида

```bash
# Замените $API на базовый URL бэкенда (например https://api.example.com).
# Локальный тест без проверки подписи: не задавайте META_APP_SECRET.

curl -X POST "$API/leads/meta/ingest" \
  -H "Content-Type: application/json" \
  -d @docs/meta-lead-sample.json
```

Ответ при одном лиде: `{ "ok": true, "leadId": "uuid", "deduped": false }`. При дедупе: `{ "ok": true, "leadId": "uuid", "deduped": true }`. Если в одном запросе несколько leadgen-событий: `{ "ok": true, "leads": [ { "leadId", "deduped" }, ... ] }`.

## Настройка бэкенда

- `META_APP_SECRET` (рекомендуется в production) — секрет приложения Meta; без него подпись вебхука не проверяется (в лог пишется предупреждение).
- `META_WEBHOOK_VERIFY_TOKEN` (опционально) — запасной verify token, если не задан в CRM → Settings.
- `META_GRAPH_API_VERSION` (опционально, по умолчанию `v21.0`) — версия Graph API для догрузки полей лида.
- `META_LEAD_COMPANY_ID` (опционально) — ID компании для новых лидов, если не задана компания в CRM → Settings → Meta.
- Также можно задать компанию для лидов в **Settings → Facebook / Meta Lead Ads** (поле company).

## Веб-интерфейс

- В карточке лида: вкладка **«Источник»** показывается для лидов с `source === META` или при наличии атрибуции/ответов/событий. На ней отображаются блоки «Атрибуция», «Ответы формы», «События».
- На основной вкладке: город, score, подсказка «Запросить контакт» при отсутствии телефона и email, блок «Добавить заметку».
- В шапке карточки: быстрые кнопки «Успешно», «Провал», «Спам» для лидов в работе.
