# RELEASE QA / Verification pass — нова модель заказів після Phase 7

**Дата:** 2026-03-18  
**Мета:** Перевірка стану проекту, аудит сценаріїв, залишкові залежності від legacy status, точечні виправлення.

---

## 1. Які файли перевірені

### Backend
- **Prisma:** `apps/backend/prisma/schema.prisma` — Order з `orderStage`, `deliveryStatus`, `financialStatus`, `paymentDueDate`, `returnAdjustmentAmount`; `status` позначено `@deprecated Phase 7`; OrderReturn, OrderReturnItem; OrderStatusHistory з `fromOrderStage`/`toOrderStage`.
- **Orders:** `orders.service.ts`, `order-stage-transitions.ts`, `order-status.service.ts`, `order-status-sync.mapper.ts`, `orders.controller.ts`, `dto/list-orders-query.dto.ts`, `dto/update-order.dto.ts`, `dto/update-order-stage.dto.ts`, `entities/order.ts`.
- **Order returns:** `order-returns.service.ts`, `order-returns.controller.ts`, DTO створення/списку/оновлення статусу.
- **Payments:** `payments.service.ts` — recalcOrder використовує `effectiveTotal = totalAmount - returnAdjustmentAmount`, оновлює `financialStatus`.
- **NP:** `np-ttn.service.ts` — persistOrderNpStatus оновлює лише `orderStage`, `deliveryStatus`, `financialStatus` (не пише `status`); порівняння для advance використовувало `order.status` (при null — ризик перезапису COMPLETED).
- **Bitrix:** `bitrix.mapper.ts` (mapBitrixDealStageToOrderStage, mapBitrixDealToPrisma), `bitrix.initial-import.service.ts`, `bitrix.delta-sync.service.ts` — при upsert/update Order передають лише `orderStage`, `deliveryStatus`, `financialStatus`; поле `status` в update не передається (у Bitrix дані містять `status` з мапера, але в Prisma update/create його не пишуть).
- **Google Sheet:** `google-sheet-send-order.service.ts` — payload.status = `order.orderStage ?? order.status ?? "NEW"`.
- **Dashboard:** `dashboard.service.ts` — `ordersByStage` по `orderStage`, revenue by day з урахуванням `returnAdjustmentAmount`, KPI по totalAmount/debtAmount.

### Frontend
- **Orders:** `page.tsx`, `OrdersKanban.tsx`, `OrderCard.tsx`, `OrderModal.tsx`, `OrdersFiltersPopover.tsx`, `FinancialKanban.tsx`, `ReturnsKanban.tsx`.
- **Components:** `StatusBadge.tsx` — пріоритет `orderStage`, fallback на `status`.
- **Dashboard:** `dashboard/page.tsx` — використовує `ordersByStage`, ORDER_STAGE_LABELS.

---

## 2. Які критичні сценарії перевірені

| Сценарій | Стан |
|----------|------|
| **Створення заказа** | create() виставляє `orderStage: NEW`, `deliveryStatus: NOT_SHIPPED`, `financialStatus` з computeFinancialStatusFromOrder. |
| **Переходи NEW → … → COMPLETED** | order-stage-transitions: дозволені переходи задані, PREPAYMENT блокує READY_TO_SHIP/SHIPPED/… без повної оплати. |
| **Відміна до відправки** | CANCELED дозволено лише з BEFORE_SHIPPED (NEW … READY_TO_SHIP). |
| **Відмова від отримання** | REFUSED лише з SHIPPED або AWAITING_RECEIPT. |
| **Предоплата блокує переходи** | REQUIRES_PAYMENT_FOR_PREPAYMENT перевіряється в validateOrderStageTransition. |
| **Відстрочка не ламає логістику** | Для DEFERRED перевірка оплати не блокує переходи доставки. |
| **paymentDueDate / financialStatus** | computeFinancialStatusFromOrder: DUE_SOON (3 дні), OVERDUE, INVOICE_PENDING, AWAITING_PAYMENT, PAID, CLOSED. |
| **Оплата зменшує debtAmount** | PaymentsService.recalcOrder() перераховує paidAmount/debtAmount і financialStatus; використовує effectiveTotal. |
| **Повернення впливає на effective total і financialStatus** | При CLOSED return: оновлюється returnAdjustmentAmount, recalcOrder(), потім при закритті останнього — orderStage RECEIVED/COMPLETED, financialStatus з effectiveTotal. |
| **Створення повернення** | Дозволено лише для RECEIVED/COMPLETED; заказ переводиться в RETURN_IN_PROGRESS. |
| **Часткове повернення / returnAdjustmentAmount** | Сума закритих повернень зберігається в returnAdjustmentAmount; debt і financialStatus рахуються від effective total. |
| **Відновлення orderStage після закриття останнього повернення** | openCount === 0 → orderStage = debtAmount <= 0 ? COMPLETED : RECEIVED, оновлюється deliveryStatus і financialStatus. |
| **NP не конфліктує з новою моделлю** | NP оновлює лише orderStage, deliveryStatus, financialStatus. При null status порівняння для advance тепер береться з orderStage (точечне виправлення). |
| **Bitrix не конфліктує** | Імпорт/дельта пишуть orderStage, deliveryStatus, financialStatus; status в Order не оновлюється. |
| **Google Sheet отримує orderStage** | status в payload = order.orderStage ?? order.status ?? "NEW". |
| **Dashboard ordersByStage / revenue / KPI** | groupBy orderStage; revenue by day з (totalAmount - returnAdjustmentAmount); KPI без змін. |

---

## 3. Проблеми / ризики

1. **NP при null status:** Якщо `order.status === null` (Phase 7), раніше як поточний статус використовувався `""`, тому будь-який статус з НП вважався «прогресом» і міг перезаписати COMPLETED старішим станом. **Виправлено:** поточний стан для порівняння береться з `orderStage` через `orderStageToLegacyStatus(order.orderStage ?? "NEW", { debtAmount })`.

2. **orders.service update() — financialStatus при зміні paymentDueDate/paymentType:** При оновленні тільки paymentDueDate або paymentType використовувався «сирий» totalAmount для computeFinancialStatusFromOrder. Для заказів з returnAdjustmentAmount це давало PAID замість CLOSED при нульовому боргу. **Виправлено:** передається effectiveTotal (totalAmount - returnAdjustmentAmount).

3. **OrderStatusService:** Залишається в модулі (providers), але ні контролер, ні інші сервіси не викликають changeStatus/setStatus; єдиний вхід — PATCH `:id/status` через OrdersService.setStatus → setOrderStage. Тобто прямий запис у Order.status більше не виконується; OrderStatusService — мертвий код для оновлення заказів (можна видалити пізніше).

4. **Коментар у setOrderStage:** У коментарі згадується «legacy status» і «writes history» — в Order поле status більше не записується, лише в OrderStatusHistory (fromStatus/toStatus для таймлайну). Функціонально коректно, коментар можна оновити пізніше.

5. **Можливі неконсистентні комбінації (потребують ручної перевірки):**  
   - Історичні закази з заповненим status, але null orderStage (після backfill мають бути заповнені; якщо backfill пропустив — UI покаже NEW через resolveStage).  
   - orderStage = COMPLETED і deliveryStatus != RECEIVED — теоретично можливо після ручних змін; логіка переходів це не породжує.  
   - Активний return при orderStage != RETURN_IN_PROGRESS — створення return примусово ставить RETURN_IN_PROGRESS, розсинхрон малоймовірний.

---

## 4. Точечні правки, що внесені

1. **apps/backend/src/np/np-ttn.service.ts**  
   - Імпорт `orderStageToLegacyStatus`.  
   - У `persistOrderNpStatus`: поточний стан для порівняння з НП — `order.status ?? orderStageToLegacyStatus(order.orderStage ?? "NEW", { debtAmount: order.debtAmount })`, щоб при null status не перезаписувати COMPLETED старішим статусом з НП.

2. **apps/backend/src/orders/orders.service.ts**  
   - У гілці оновлення при зміні `paymentDueDate` або `paymentType`: для computeFinancialStatusFromOrder передається `effectiveTotal = totalAmount - returnAdjustmentAmount` замість сирого totalAmount, щоб коректно виставляти CLOSED при нульовому боргу після повернень.

---

## 5. Де ще живе legacy status

| Місце | Чи читається | Чи пишеться | Допустимість |
|-------|--------------|------------|--------------|
| **Order.status у Prisma** | Так (API/list, mapToEntity, getById, timeline history) | Ні (Phase 7: orders, returns, NP, Bitrix не пишуть) | Допустимо для відображення та фільтра за legacy-значенням; для нових заказів може бути null. |
| **List filter q.status** | Так (мапиться в orderStage на бекенді) | — | Допустимо: зворотна сумісність API. |
| **OrderStatusHistory** | Так (fromStatus, toStatus у таймлайні) | Так (при setOrderStage пишемо toStatus/fromStatus з orderStageToLegacyStatus) | Допустимо для історії. |
| **NP persistOrderNpStatus** | Так (для порівняння «чи просувати»; тепер з fallback на orderStage) | Ні | Допустимо. |
| **OrdersService.setStatus** | — | Ні в Order (делегує в setOrderStage) | Допустимо: legacy endpoint. |
| **OrderStatusService** | — | Теоретично пише status, але не викликається | Мертвий код; видалення — окрема задача. |
| **Frontend (StatusBadge, OrderCard, Kanban)** | Так (orderStage ?? status) | — | Допустимо: fallback для старих даних. |
| **Google Sheet payload** | order.orderStage ?? order.status | — | Допустимо. |

---

## 6. Що обов’язково перевірити вручну перед релізом

- [ ] Пройти повний цикл заказа: NEW → CONFIRMED → READY_TO_SHIP → SHIPPED → AWAITING_RECEIPT → RECEIVED → COMPLETED (з предоплатою та з відстрочкою).
- [ ] Відміна до відправки (CANCELED з NEW/CONFIRMED/…).
- [ ] Відмова від отримання (REFUSED з SHIPPED/AWAITING_RECEIPT).
- [ ] Створення повернення з RECEIVED/COMPLETED, часткове повернення, прохід по етапах до CLOSED; перевірити, що debtAmount і financialStatus оновлюються і після закриття останнього повернення orderStage = RECEIVED або COMPLETED.
- [ ] Додавання/редагування платежу: перерахунок debtAmount і financialStatus (в т.ч. для заказа з returnAdjustmentAmount).
- [ ] Синхронізація статусу НП: оновлення заказа після зміни статусу ТТН; переконатися, що COMPLETED не перезаписується старішим статусом.
- [ ] Bitrix: імпорт/дельта-синк заказів — колонки по orderStage, без падій.
- [ ] Dashboard: ordersByStage, revenue by day, KPI (ordersCount, revenue, debtTotal).
- [ ] Фільтри заказів: по orderStage, по legacy status (якщо використовується), по financialStatus, overdue/dueSoon.
- [ ] Відправка заказа в Google Sheet при READY_TO_SHIP — у відповіді коректний status (orderStage).

---

## 7. Чи готова система до production rollout

**Так, з обережністю.**  
Нова модель (orderStage, deliveryStatus, financialStatus, OrderReturn, returnAdjustmentAmount) узгоджена з планом Phase 7: legacy status не записується в Order, усі основні потоки йдуть через orderStage та пов’язані поля. Внесені точечні виправлення (NP при null status, financialStatus при оновленні paymentDueDate/paymentType з урахуванням returnAdjustmentAmount) знижують ризики регресій. Перед повним викатом варто виконати ручний чек-лист вище та перевірити історичні закази з null orderStage (якщо такі залишилися після backfill).

---

## 8. Що ще заважає повному видаленню status

- **Читання:** API та фронт ще повертають/використовують `status` для відображення та фільтра (q.status → orderStage). Щоб прибрати поле з API та UI, потрібно: прибрати `status` з DTO/відповідей, перевести всі клієнти на orderStage; прибрати фільтр за status або залишити його лише як аліас до orderStage.
- **OrderStatusHistory:** Зберігає fromStatus/toStatus для таймлайну; можна залишити для історії або поступово переходити тільки на fromOrderStage/toOrderStage.
- **Схема БД:** Поле `Order.status` і enum OrderStatus ще в schema.prisma; видалення — окрема міграція після повного відмовлення від читання/фільтрів.
- **OrderStatusService:** Можна видалити після підтвердження, що ніде не викликається setStatus/changeStatus для прямого оновлення Order.

Підсумок: для production rollout поточної реалізації достатньо; повне видалення status — наступний крок після міграції клієнтів і очищення коду.
