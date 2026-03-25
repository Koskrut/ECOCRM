# Contact card — перевірки та тести (план §21)

У репозиторії поки немає налаштованого Jest/Vitest для web/backend. Рекомендовані перевірки після змін карточки:

## Backend

- `GET /contacts/:id/card`: KPI при змішаних `clientId` / `contactId`, `kpiAccess.showPartialDataNotice`, RBAC (MANAGER не бачить чужі угоди).
- Логи Nest: `ContactsService` пише `getCard ok|fail` з `ms` — збирати error rate / latency в APM за цим префіксом.
- `GET/PATCH /settings/contact-card-ui`: прапор `contactCardV2` у `SystemSetting` (`id: contact_card_ui`).

## Frontend

- Ручний smoke: відкрити контакт → KPI + три блоки замовлень → швидкі дії (задача, оплата при боргу) → вкладка доставки (UK при v2).
- Після додавання тестового раннера: мок `ContactCardPayload` для `ContactKpiStrip` / `ContactOrdersSections`.

## E2E (за наявності Playwright/Cypress)

- Список контактів → відкрити картку → додати коментар у таймлайні → відкрити замовлення зі списку.
