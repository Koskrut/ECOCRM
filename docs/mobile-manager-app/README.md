# Мобильное приложение для менеджеров CRM

Документация по продукту и реализации мобильного клиента для полевых менеджеров: визиты, GPS-верификация, смены, трек и топливо.

| Документ | Описание |
|----------|----------|
| [01-mvp-scope.md](./01-mvp-scope.md) | MVP: экраны, политика GPS, топливо, правила верификации |
| [02-data-model.md](./02-data-model.md) | Модели БД: GPS-события, смены, сэмплы, профиль авто, отчёт по топливу |
| [03-mobile-ux.md](./03-mobile-ux.md) | Навигация, экраны, пользовательские сценарии |
| [04-manager-core-features.md](./04-manager-core-features.md) | Базовые функции менеджера в приложении |
| [05-api-changes.md](./05-api-changes.md) | Изменения и новые HTTP API |
| [06-implementation-roadmap.md](./06-implementation-roadmap.md) | Этапы MVP → v4 |

Связанный код в backend:

- Верификация GPS при старте/завершении визита: `VisitsService`, `POST /visits/:id/start`, `POST /visits/:id/complete`
- Карточка визита для мобильного клиента: `GET /visits/:id`
- Смена, сэмплы локации, дневной отчёт топлива: `FieldModule`, префикс `/field/...`

Клиент (**Expo**): [apps/mobile](../../apps/mobile/README.md) — вход, вкладки, визиты, смена, топливо.
