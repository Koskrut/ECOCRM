# Telegram inbox — production smoke checklist

Ручной прогон после деплоя или изменений в Telegram-контуре. Модуль `int.integrations_telegram`
работает **in-process на core** (`AppModuleCore`): webhook, inbox `/conversations/*` и доставка кодов
сброса пароля через `IntegrationPortsService` обрабатываются на core, отдельного `TELEGRAM_UPSTREAM_URL`
нет. `OUTBOUND_UPSTREAM_URL` влияет только на признак reachability модуля в Control Plane UI
(`module-state.service.ts`), а не на наличие роутов.

## Настройки

- [ ] `GET /settings/telegram` — токен и webhook secret замаскированы, `publicBaseUrl` задан.
- [ ] В Settings → Telegram нажать «Register webhook». Ожидается сообщение `Webhook зареєстровано: …`.
- [ ] «Check status» показывает актуальный URL, `pending updates = 0` и пустой `last error`.

## Входящие

- [ ] Тестовое сообщение боту появляется в `/inbox/telegram` в течение ~5 c (polling).
- [ ] Первое сообщение без телефона: клиент получает **один** ответ (запрос телефона), без второго
      авто-ответа.
- [ ] Плейн `/start` без телефона: **один** приветственный ответ (welcome) с кнопкой «Поділитися номером».
- [ ] Отправка фото/документа/голоса: сообщение сохраняется с `mediaType`/`fileId`, в списке видно плейсхолдер.

## Привязка к CRM

- [ ] Поделиться контактом: находится существующий contact/lead или создаётся lead.
- [ ] Телефон принадлежит компании, но контакта/лида нет: создаётся lead с `companyId` этой компании.
- [ ] Нет компании и нет `TELEGRAM_LEAD_COMPANY_ID`: placeholder-контакт **не** создаётся (только
      `TelegramAccount` + `Conversation`).

## Ответы менеджера и назначение

- [ ] Ответ менеджера доходит в Telegram и появляется в CRM. При недоступности Bot API сообщение
      помечается как `FAILED` (в чате «⚠ не доставлено»), но не теряется.
- [ ] В карточке чата «Взяти собі» / «Зняти» меняют ответственного.

## Auth

- [ ] `/link TOKEN` в приватном чате привязывает Telegram; в группе — отказ «лише в приватному чаті».
- [ ] Сброс пароля: код приходит в Telegram (на **core**, даже если задан `OUTBOUND_UPSTREAM_URL`).

## Gating и идемпотентность

- [ ] При `MODULE_GATING_ENABLED=true` модуль присутствует в лицензии; inbox и settings доступны.
- [ ] При выключенном модуле webhook продолжает отвечать `200 OK` (не 404) — `@SkipModuleGating`,
      поэтому Telegram не уходит в retry-шторм.
- [ ] Повторная доставка одного `update_id` (retry Telegram) не создаёт дублей сообщений/авто-ответов.
