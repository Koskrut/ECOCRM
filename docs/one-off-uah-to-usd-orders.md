# Разовое изменение валюты заказов UAH → USD (на сервере)

Сделки изначально записывались в гривнах (UAH), но суммы уже в долларах — нужно только поменять поле валюты на USD.

## Шаги на сервере

### 1. Подключиться по SSH к серверу, где крутится CRM

```bash
ssh user@your-server
```

### 2. Перейти в каталог проекта (например `/opt/crm`)

```bash
cd /opt/crm
```

(или тот путь, где лежит `docker-compose.prod.yml` и `.env`)

### 3. Подключиться к PostgreSQL и выполнить обновление

**Вариант A — через контейнер Postgres (рекомендуется):**

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U crm -d crm -c "UPDATE \"Order\" SET currency = 'USD' WHERE currency = 'UAH';"
```

Пароль не запрашивается: в контейнере пользователь `crm` настроен без пароля для localhost.

**Вариант B — интерактивно (если нужно сначала посмотреть количество строк):**

```bash
docker compose -f docker-compose.prod.yml exec postgres psql -U crm -d crm
```

В консоли `psql`:

```sql
-- сколько заказов с UAH
SELECT COUNT(*) FROM "Order" WHERE currency = 'UAH';

-- обновить валюту на USD
UPDATE "Order" SET currency = 'USD' WHERE currency = 'UAH';

-- проверить (должно быть 0)
SELECT COUNT(*) FROM "Order" WHERE currency = 'UAH';

\q
```

### 4. Готово

После выполнения `UPDATE` все заказы с валютой UAH будут с валютой USD. Суммы не меняются.
