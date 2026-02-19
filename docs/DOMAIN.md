# CRM — DOMAIN (MVP)

Версия: 1.0  
Дата: 2026-02-02  
Файл: `docs/DOMAIN.md`

---

## 0. Назначение документа

`DOMAIN.md` фиксирует доменную модель и правила: статусы, переходы, инварианты, автоматику и ключевые решения, чтобы:

- разработка была предсказуемой (state machine, единая точка правды)
- интеграции работали надежно (идемпотентность, ретраи)
- бизнес-логика не расползалась по UI и случайным сервисам

---

## 1. Доменная модель (контекст)

### 1.1 Главные объекты

- **Order** — центральный объект продажи
- **Shipment** — доставка/ТТН (первая интеграция: Новая Почта)
- **Payment** — оплата (первая интеграция: Privat24)
- **Activity** — таймлайн: действия менеджера + системные события
- **StatusHistory** — история переходов (аудит статусов)
- **IntegrationEvent** — входящие события интеграций (для идемпотентности и ретраев)

### 1.2 Привязки

- Company 1—N Client
- Company 1—N Order
- Order 1—N OrderItem
- Order 1—N Shipment (в MVP: **строго 1**, см. ограничения)
- Order 1—N Payment (в MVP: Payment может быть только **к одному** Order)
- Company/Client/Order 1—N Activity
- Любая сущность со статусом → N StatusHistory

---

## 2. Статусы и state machine

### 2.1 OrderStatus (MVP)

- `DRAFT` — черновик (опционально; если не нужен, сразу создаем `NEW`)
- `NEW` — заказ создан
- `SHIPPING_CREATED` — создана ТТН (Shipment создан, ttn_number есть)
- `PAID_PARTIAL` — частично оплачен
- `PAID` — полностью оплачен
- `SHIPPED` — принят перевозчиком / “в пути”
- `DELIVERED` — доставлен / получен
- `CANCELLED` — отменен

#### Семантика (что означает статус)

- `NEW`: заказ есть, Shipment может отсутствовать, оплат может не быть
- `SHIPPING_CREATED`: есть Shipment с ttn_number, но статус доставки может быть еще `CREATED`
- `PAID_PARTIAL`: сумма оплаченного < total_amount
- `PAID`: сумма оплаченного ≥ total_amount
- `SHIPPED`: по данным перевозчика, отправление в пути/принято
- `DELIVERED`: по данным перевозчика, доставлено/получено
- `CANCELLED`: бизнес-отмена (не означает возврат денег автоматически)

> Важно: `PAID` и `SHIPPING_CREATED` — независимые факты. Но OrderStatus хранит “главный” статус. Правило выбора статуса фиксируем ниже (инварианты).

---

### 2.2 ShipmentStatus (MVP)

- `CREATED` — ТТН создана
- `IN_TRANSIT` — в пути
- `DELIVERED` — доставлено
- `FAILED` — ошибка/не доставлено (опционально)
- `RETURNED` — возврат (опционально)

---

### 2.3 PaymentStatus (MVP)

- `RECEIVED` — платеж получен (из интеграции или вручную)
- `MATCHED` — привязан к заказу
- `NEEDS_REVIEW` — требует разбора (сомнительный матч)
- `REJECTED` — отклонен (ошибка/дубликат/не наш) (опционально)

---

## 3. Переходы статусов (таблицы)

### 3.1 Переходы OrderStatus

| Событие                   | From                                    | To                   | Инициатор      | Условие                      |
| ------------------------- | --------------------------------------- | -------------------- | -------------- | ---------------------------- |
| Создание заказа           | (—)                                     | `NEW` (или `DRAFT`)  | Manager        | Заказ сохранен               |
| Успешное создание ТТН     | `NEW`,`PAID_PARTIAL`,`PAID`             | `SHIPPING_CREATED`\* | System/Manager | Shipment создан + ttn_number |
| Поступила оплата (часть)  | `NEW`,`SHIPPING_CREATED`                | `PAID_PARTIAL`\*     | System         | paid_amount < total_amount   |
| Поступила оплата (полная) | `NEW`,`SHIPPING_CREATED`,`PAID_PARTIAL` | `PAID`\*             | System         | paid_amount ≥ total_amount   |
| Доставка “в пути”         | `SHIPPING_CREATED`                      | `SHIPPED`            | System         | ShipmentStatus → IN_TRANSIT  |
| Доставка “доставлено”     | `SHIPPED`                               | `DELIVERED`          | System         | ShipmentStatus → DELIVERED   |
| Ручная отмена             | `*`                                     | `CANCELLED`          | TeamLead       | обязательная причина         |

\* **Конфликт статусов решается правилом “выбора главного статуса”** (см. 4.2). Например: если заказ уже `PAID`, создание ТТН не должно “ухудшить” факт оплаты. Мы либо:

- оставляем `PAID` как главный, но фиксируем факт Shipping в Shipment + Activity, либо
- используем составной статус (в MVP не делаем).

**В MVP рекомендуем:** OrderStatus отражает “этап выполнения” с учетом доставки, но факт оплаты виден через paid_amount и бейдж “Paid”. См. 4.2.

---

### 3.2 Переходы ShipmentStatus (пример маппинга)

| Событие перевозчика | ShipmentStatus    |
| ------------------- | ----------------- |
| ТТН создана         | `CREATED`         |
| Принято/в пути      | `IN_TRANSIT`      |
| Доставлено/получено | `DELIVERED`       |
| Отказ/ошибка        | `FAILED` (опц.)   |
| Возврат отправителю | `RETURNED` (опц.) |

---

### 3.3 Переходы PaymentStatus

| Событие               | From           | To             | Кто      |
| --------------------- | -------------- | -------------- | -------- |
| Платеж импортирован   | (—)            | `RECEIVED`     | System   |
| Матч уверенный        | `RECEIVED`     | `MATCHED`      | System   |
| Матч сомнительный     | `RECEIVED`     | `NEEDS_REVIEW` | System   |
| Руководитель привязал | `NEEDS_REVIEW` | `MATCHED`      | TeamLead |
| Руководитель отклонил | `NEEDS_REVIEW` | `REJECTED`     | TeamLead |

---

## 4. Бизнес-правила и инварианты

### 4.1 Деньги и суммы

- `Order.subtotal_amount` = Σ(OrderItem.qty \* price)
- `Order.total_amount` = subtotal - discount_amount
- `Order.paid_amount` = Σ(Payment.amount) для `PaymentStatus = MATCHED` и `matched_order_id = order.id`
- `Order.debt_amount` = max(total_amount - paid_amount, 0)

Правила:

- Разрешены частичные оплаты (несколько Payment на один Order).
- В MVP **один Payment можно привязать только к одному Order**.

---

### 4.2 Правило выбора “главного” OrderStatus (важно)

Чтобы избежать конфликтов “оплата vs доставка”, фиксируем приоритеты:

**Факты (не спорим):**

- факт оплаты: `paid_amount` и бейдж `Paid`/`Partial`
- факт доставки: Shipment существует и его статус

**OrderStatus в MVP = этап исполнения доставки (fulfillment stage)**:

- если Order `CANCELLED` → всегда CANCELLED (самый высокий приоритет)
- если ShipmentStatus = DELIVERED → OrderStatus = DELIVERED
- else если ShipmentStatus = IN_TRANSIT → OrderStatus = SHIPPED
- else если Shipment существует → OrderStatus = SHIPPING_CREATED
- else → OrderStatus = NEW

Оплата **не изменяет** OrderStatus напрямую, она меняет:

- `paid_amount`
- `payment_badge`: `UNPAID | PARTIAL | PAID` (рассчитываемое поле/бейдж в UI)
- Activity + StatusHistory для Payment

> Если бизнесу критично видеть “PAID” как OrderStatus — можно переключить модель на “финансовый статус” + “логистический статус” отдельно. Но в MVP проще и чище держать OrderStatus как fulfillment.

---

### 4.3 Ручные изменения статусов

- Ручной переход OrderStatus разрешен только TeamLead.
- Каждое ручное изменение требует `reason`.
- Ручное изменение **не должно нарушать инварианты** (например, нельзя поставить DELIVERED без подтверждения перевозчика — если это важно; иначе фиксируем как “override”).

---

### 4.4 История и таймлайн

- Любое изменение статуса (Order/Shipment/Payment) → запись в `StatusHistory`.
- Любое важное событие → запись `Activity(type=SYSTEM)`:
  - создан заказ
  - создана ТТН
  - изменен статус доставки
  - получен платеж
  - привязан платеж
  - ручная корректировка/override

---

## 5. Автоматика (события → обработчики)

### 5.1 События домена (Domain Events)

- `OrderCreated(order_id)`
- `ShipmentCreated(order_id, shipment_id, ttn_number)`
- `ShipmentStatusUpdated(shipment_id, from, to)`
- `PaymentReceived(payment_id)`
- `PaymentMatched(payment_id, order_id, confidence)`
- `PaymentNeedsReview(payment_id)`
- `OrderCancelled(order_id, reason)`

### 5.2 Обработчики (Handlers)

- `OnShipmentCreated`:
  - создать StatusHistory (Shipment CREATED)
  - создать Activity SYSTEM
  - пересчитать OrderStatus (через правило 4.2)
- `OnShipmentStatusUpdated`:
  - StatusHistory
  - Activity SYSTEM
  - пересчитать OrderStatus (4.2)
- `OnPaymentReceived`:
  - попытка матчить
- `OnPaymentMatched`:
  - PaymentStatus → MATCHED
  - пересчет paid_amount
  - Activity SYSTEM (и StatusHistory для Payment)
- `OnPaymentNeedsReview`:
  - PaymentStatus → NEEDS_REVIEW
  - отправка в очередь/экран “на разбор”

---

## 6. Интеграции: правила надежности

### 6.1 Идемпотентность (обязательно)

- Payment: уникальность `(source, transaction_id)`
- Shipment: уникальность `(carrier, ttn_number)` + запрет создавать второй Shipment для Order (MVP)
- IntegrationEvent: уникальность `(integration, external_id)` или `(integration, hash(payload))`

Поведение:

- если событие уже обработано → отвечаем OK и не создаем дубль
- если обработка упала → статус IntegrationEvent = FAILED, attempts++, retry later

---

### 6.2 Ретраи

- backoff: 1m, 5m, 15m, 1h (пример)
- max attempts: 10 (конфиг)
- после max attempts → “DLQ” (таблица/экран ошибок интеграции)

---

### 6.3 Логи

- хранить request/response метаданные (без секретов)
- хранить `raw_payload` для Payment/Shipment (опционально, но сильно помогает поддержке)

---

## 7. Матчинг оплат (доменная логика)

### 7.1 Нормализация Payment

Из интеграции получаем:

- amount, currency, paid_at, transaction_id
- sender_name/phone (если есть)
- description (назначение)

Создаем Payment со статусом `RECEIVED`.

### 7.2 Правила матчинга (MVP)

Считаем `match_confidence` (0..100), выбираем лучший Order-кандидат:

**Сильные сигналы**

- order_number найден в description → +80
- точное совпадение суммы с debt_amount → +30
- совпадение телефона отправителя с Client.phone → +25
- совпадение Company.name по sender_name (фаззи, аккуратно) → +15
- заказ создан в окне ±14 дней → +10

**Пороги**

- ≥90 → auto MATCHED
- 70..89 → авто или review (по настройке бизнеса; по умолчанию review)
- <70 → NEEDS_REVIEW

### 7.3 Разрешение неоднозначностей

Если 2 заказа с близким скором:

- если разница < 10 пунктов → NEEDS_REVIEW
- если несколько заказов с одинаковой суммой → NEEDS_REVIEW

---

## 8. Таймлайн (Activity) — доменные правила

### 8.1 Типы Activity (MVP)

- `CALL` — звонок
- `MEETING` — встреча
- `NOTE` — заметка
- `SYSTEM` — системные события

### 8.2 Обязательные поля по типам

- CALL: outcome (опц.), call_duration_sec (опц.), description (опц.), next_step_at (опц.)
- MEETING: start_at (обяз.), end_at (опц.), outcome/description, next_step_at (опц.)
- NOTE: description (обяз.)
- SYSTEM: subject (обяз.), description (опц.)

### 8.3 Связи

Activity должна быть привязана минимум к одному:

- company_id или client_id или order_id

---

## 9. Ограничения MVP (явно)

1. **Один Shipment на один Order** (без частичных отгрузок)
2. **Один Payment → один Order** (без “раскидать один платеж на 2 заказа”)
3. Валюта по умолчанию UAH (без мультивалютности)
4. OrderStatus = fulfillment stage, оплата — отдельный бейдж/сумма (см. 4.2)

---

## 10. Словарь ошибок интеграций (минимум)

### 10.1 Nova Poshta (пример)

- `NP_VALIDATION_ERROR` — не хватает полей для ТТН
- `NP_AUTH_ERROR` — токен/ключ неверный
- `NP_RATE_LIMIT` — лимит API
- `NP_SERVER_ERROR` — временная ошибка сервера

### 10.2 Privat24 (пример)

- `P24_AUTH_ERROR`
- `P24_DUPLICATE_TX` — дубликат transaction_id
- `P24_PARSE_ERROR` — не удалось нормализовать payload

---

## 11. Checklist для разработки (MVP)

- [ ] единый сервис статусов + StatusHistory
- [ ] единый сервис интеграций + IntegrationEvent + идемпотентность
- [ ] пересчет OrderStatus строго по правилу 4.2
- [ ] таймлайн Activity: UI и API
- [ ] очередь NEEDS_REVIEW для оплат
- [ ] индексы на ключевые поисковые поля
