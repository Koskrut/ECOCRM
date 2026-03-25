# Contact card — Phase 2+ backlog

Пункт **D** плану: не входить у Phase 1 (§28). Реалізація окремими епіками.

| Пріоритет | Епік | Опис |
|-----------|------|------|
| D1 | Фінанси | Окрема вкладка / секція: агрегати оплат і запитів оплати по `clientId`, згоджені з §28.8 |
| D2 | Логістика | ТТН, відвантаження, зв’язок з `Order` / `Shipment` |
| D3 | Union timeline | Telegram, платежі, ТТН, audit у одній стрічці з курсором |
| D4 | ContactChangeHistory | Або універсальний audit log |
| D5 | Файли | Модель вкладень / S3 або інше сховище |
| D6 | Full-page | Маршрут `/contacts/[id]` (§28.4 Phase 2+) |
| D7 | §26 attention | Бейджі: немає активності N днів, немає компанії, просрочені задачі тощо |
| D8 | §25 security audit | Журнал чутливих дій (reset пароля, зміна owner, company relink) |

Див. нормативний план: `.cursor/plans/contact_card_redesign_f437cadb.plan.md`.
