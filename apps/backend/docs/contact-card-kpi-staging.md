# Contact card KPI — перевірка планів запитів (staging)

Перед навантажувальним тестом карточки контакта на staging виконайте для «важкого» `contactId` з великою кількістю замовлень:

## Індекси

У схемі вже є `Order.clientId`, `Order.contactId`, `Order.ownerId`, `Task.contactId`, `Activity.contactId`. Для агрегатів карточки критичні фільтри за `clientId` + умови видимості (RBAC).

## Приклади EXPLAIN (PostgreSQL)

```sql
EXPLAIN ANALYZE
SELECT COUNT(*), COALESCE(SUM("totalAmount"),0), COALESCE(SUM("debtAmount"),0)
FROM "Order"
WHERE "clientId" = $contactId
  AND ("orderStage" IS NULL OR "orderStage" NOT IN ('COMPLETED','CANCELED','REFUSED','RETURN_IN_PROGRESS'));
```

```sql
EXPLAIN ANALYZE
SELECT COUNT(*) FROM "Task"
WHERE "contactId" = $contactId AND ("assigneeId" = $uid OR "createdById" = $uid);
```

Якщо Seq Scan на великих таблицях — переконайтесь, що статистика оновлена (`ANALYZE "Order";`).

## Ліміти

Ендпоінт `GET /contacts/:id/card` повертає до 50 позицій у блоках legacy / company orders; повний список залишається в `GET /orders?clientId=`.
