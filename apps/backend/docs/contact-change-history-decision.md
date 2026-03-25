# Contact change history — рішення

**Рішення:** при потребі паритету з карточкою компанії вводити **`ContactChangeHistory`** за зразком [`CompanyChangeHistory`](../prisma/schema.prisma) (поля: `contactId`, `changedBy`, `action`, `payload`, `createdAt`). Універсальний `EntityAuditLog` — окремий епік, якщо знадобиться єдиний журнал по сутностях.

**Phase 1 карточки:** історія змін контакта в UI може залишатися порожньою до міграції; чутливі дії (сброс пароля магазину, зміна owner) — логувати через structured logs / майбутній `SecurityAuditLog` згідно з планом.
