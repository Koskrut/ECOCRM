# Meta Lead Ads

Интеграция лидов из Meta Lead Ads: приём вебхука и отображение атрибуции/ответов формы в карточке лида.

## Эндпоинты

- **POST** `/leads/meta/ingest` — приём payload от Meta (Lead Ads webhook). Тело запроса — JSON в формате Meta (см. пример в `docs/meta-lead-sample.json`).
- **GET** `/leads/:id` — лид с полями `attribution`, `answers`, `events`, `identities`.
- **PATCH** `/leads/:id` — обновление лида (в т.ч. `firstName`, `lastName`, `city`, `comment`, `channel`, `ownerId`).
- **POST** `/leads/:id/note` — добавление заметки к лиду. Тело: `{ "message": "текст заметки" }`.
- **PATCH** `/leads/:id/status` — смена статуса (в т.ч. `WON`, `LOST`, `SPAM`).

## Пример: отправка тестового лида

```bash
# Замените $API на базовый URL бэкенда (например https://api.example.com)
# и $TOKEN на Bearer-токен авторизации.

curl -X POST "$API/leads/meta/ingest" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d @docs/meta-lead-sample.json
```

Ответ при успехе: `{ "ok": true, "leadId": "uuid", "deduped": false }`. При дедупе по контакту: `{ "ok": true, "leadId": "uuid", "deduped": true }`.

## Настройка бэкенда

- `META_LEAD_COMPANY_ID` (опционально) — ID компании, к которой привязывать новых лидов. Если не задан, используется первая компания.

## Веб-интерфейс

- В карточке лида: вкладка **«Источник»** показывается для лидов с `source === META` или при наличии атрибуции/ответов/событий. На ней отображаются блоки «Атрибуция», «Ответы формы», «События».
- На основной вкладке: город, score, подсказка «Запросить контакт» при отсутствии телефона и email, блок «Добавить заметку».
- В шапке карточки: быстрые кнопки «Успешно», «Провал», «Спам» для лидов в работе.
