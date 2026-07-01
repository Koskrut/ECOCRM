# Meta Messaging (Instagram Direct / Facebook Messenger)

Интеграция входящих и исходящих сообщений Instagram Direct и Facebook Messenger в инбокс CRM.

## Эндпоинты

- **GET** `/integrations/meta/webhook` — верификация вебхука Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`). Ответ — plain text `hub.challenge`. Токен: CRM → Settings → Meta Messaging → Webhook Verify Token (или `META_MESSAGING_WEBHOOK_VERIFY_TOKEN`).
- **POST** `/integrations/meta/webhook` — приём messaging-событий. Публичный маршрут. При наличии `META_APP_SECRET` (или `META_MESSAGING_APP_SECRET`) проверяется `X-Hub-Signature-256`.
- **GET** `/meta-conversations?channel=INSTAGRAM|FACEBOOK` — список диалогов (JWT, модуль `int.integrations_meta_messaging`).
- **GET** `/meta-conversations/unread-count?channel=INSTAGRAM|FACEBOOK` — количество открытых диалогов с последним входящим сообщением.
- **GET** `/meta-conversations/:id/messages` — история сообщений.
- **POST** `/meta-conversations/:id/messages` — отправить ответ (`{ "text": "..." }`).
- **PATCH** `/meta-conversations/:id` — смена статуса (`OPEN` / `PENDING` / `CLOSED`).
- **POST** `/meta-conversations/:id/link-contact` — привязка к контакту.
- **POST** `/meta-conversations/:id/create-contact` — создать контакт из лида.

## Настройка Meta App (перед production)

1. **Аккаунты**: Instagram Business/Creator, привязанный к Facebook Page.
2. **Meta App**: продукт Messenger / Instagram Messaging.
3. **Permissions** (Advanced Access через App Review):
   - `pages_messaging`
   - `pages_manage_metadata`
   - `instagram_manage_messages`
4. **Webhooks**: callback `https://<api-host>/integrations/meta/webhook`, поле `messages`, объекты `page` и `instagram`.
5. **Page Subscriptions**: `POST /{page-id}/subscribed_apps` с Page Access Token.
6. **Токен**: Page Access Token с правами на отправку/получение сообщений.

Документация Meta: [Instagram Messaging overview](https://developers.facebook.com/docs/instagram-messaging/overview/), [Webhooks](https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/).

## Настройка CRM

### Settings → Meta Messaging

| Поле | Назначение |
|------|------------|
| Webhook Verify Token | Совпадает с Meta App Dashboard |
| Facebook Page ID | ID страницы для Graph API `/{page-id}/messages` |
| Page Access Token | Отправка ответов и подписка на вебхуки |
| Instagram Business Account ID | Опционально, для справки |
| Company ID для лидов | Компания для автосоздания лида при первом DM |
| Graph API version | По умолчанию `v21.0` |

### Переменные окружения (опционально)

| Переменная | Назначение |
|------------|------------|
| `META_APP_SECRET` | Проверка подписи вебхука (общая с Lead Ads) |
| `META_MESSAGING_WEBHOOK_VERIFY_TOKEN` | Запасной verify token |
| `META_MESSAGING_PAGE_ID` | Page ID |
| `META_MESSAGING_PAGE_ACCESS_TOKEN` | Page Access Token |
| `META_MESSAGING_LEAD_COMPANY_ID` | Company для новых лидов |
| `META_GRAPH_API_VERSION` | Версия Graph API |

## Веб-интерфейс

- `/inbox/instagram` — инбокс Instagram Direct
- `/inbox/facebook` — инбокс Facebook Messenger
- `/settings/meta-messaging` — настройки подключения

## Ограничения API (MVP)

- Только текстовые сообщения и placeholder для медиа (`[image]`, `[video]` и т.д.)
- 24-часовое окно ответа; при ответе позже суток CRM использует tag `HUMAN_AGENT`
- Без AI-подсказок ответов (в отличие от Telegram inbox)
- App Review: без Advanced Access вебхуки работают только для тестеров приложения

## App Review

1. Подготовьте screencast: входящее сообщение в Instagram/Facebook → появление в CRM → ответ из CRM.
2. Запросите Advanced Access для `pages_messaging`, `instagram_manage_messages`, `pages_manage_metadata`.
3. Укажите use case: «CRM inbox for customer support via Instagram Direct and Facebook Messenger».
4. Опубликуйте приложение (Live Mode) — вебхуки для реальных пользователей требуют опубликованного app.

## Отличие от Meta Lead Ads

| | Lead Ads | Messaging Inbox |
|---|----------|-----------------|
| Webhook URL | `/leads/meta/ingest` | `/integrations/meta/webhook` |
| Settings | Meta Lead Ads | Meta Messaging |
| Модуль | `core.crm` (лиды) | `int.integrations_meta_messaging` |
| Данные | Лиды из форм | Диалоги и сообщения |

Один Page Access Token может использоваться для обеих интеграций, но permissions разные.
