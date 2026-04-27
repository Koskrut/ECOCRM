# Workflow Debt

## 1. User.isActive отсутствует

**Status:** resolved before Track D.

`assign_user` теперь проверяет не только existence пользователя, но и active state через `User.isActive`.

**Сделано:** добавлено `isActive Boolean @default(true)` в `User` model отдельной миграцией. Existing users получают `true` по default. Workflow `assign_user` и `create_task` пропускают inactive users с `validation_error` и `validationError: "user_inactive"`.

## 2. Permission V1 = ADMIN-only для user triggers

Сейчас workflow user actions работают только когда триггер инициирован admin. Это блокирует use case "менеджер настраивает workflow для своей команды".

**Действие:** места проверки роли помечены явным TODO:

```ts
// TRACK_B4: replace with RBAC permission check on field/entity, not role check
```

Через 6 месяцев когда B4 будет готов — эти места найдутся grep'ом и заменятся на granular permission checks.

## 3. External actions не реализованы

В текущем V1 workflow engine делает только internal операции: `update_field`, `assign_user`, `create_task`. Email, Telegram, Webhook — следующий коммит после Track D, согласно roadmap.

**Действие:** в README workflow разделе добавлено явное ограничение для пользователей:

> Workflow в текущей версии поддерживает изменение полей, назначение ответственных и создание задач. Уведомления (email, Telegram, webhook) появятся в следующей версии.

Не использовать формулировку "автоматизации" в общем смысле при анонсе фичи клиентам — использовать конкретику.

## 4. Template engine ограничен interpolation

Сейчас mustache-style без логики. Если фидбэк покажет что нужны условия или форматирование — реализовать через:

- **Filters в interpolation:** `{{deal.amount | currency}}`, `{{deal.createdAt | date:short}}`. Список filter'ов закрытый, безопасный.
- **Conditional templates на уровне action:** action имеет несколько template-полей, в коде action выбирается какой использовать в зависимости от declarative conditions.

**Запрещено:** добавлять `{{#if}}`, `{{#each}}` или другую логику в template engine. Это backdoor в expression language, который мы намеренно запретили в guardrails.
