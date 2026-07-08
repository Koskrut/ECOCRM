# API: визиты, GPS, field, топливо, офлайн

Базовый префикс API совпадает с существующим backend (NestJS). Аутентификация — как у текущего мобильного/web клиента (JWT / cookie+BFF по выбранному каналу).

Все указанные маршруты под модулем **`ext.visits`** (`@RequireModule(ModuleIds.Visits)`).

## Визиты: загрузка карточки

### `GET /visits/:id`

Возвращает одну визиту с связанными **`contact`** / **`company`** (минимальный набор полей). Используется мобильным клиентом.

## Визиты: GPS при старте и завершении

### `POST /visits/:id/start`

Тело (опционально, JSON):

```json
{
  "lat": 50.4501,
  "lng": 30.5234,
  "accuracyM": 12.5,
  "clientRecordedAt": "2026-05-15T07:31:00.000Z",
  "permissionState": "granted",
  "locationProvider": "fused"
}
```

Ответ — обновлённый `Visit`. При переданном GPS-блоке в ответе появится заполненное поле **`startGpsVerification`**.

Если тело без GPS-полей (поведение существующего web-клиента), сервер **не** создаёт `VisitGpsEvent` и **не** трогает поля верификации — обратная совместимость.

### `POST /visits/:id/complete`

Существующие поля: `outcome`, `resultNote`, `nextActionAt`, `nextActionNote`.

Дополнительно — тот же GPS-блок, что и для `start` (опционально).

Если GPS-блок передан, сервер сохраняет **`VisitGpsEvent`** и обновляет `completeGpsVerification` на визите. Без блока — только завершение визита, как раньше (web).

## Field: смена и трек

### `POST /field/shifts/start`

```json
{
  "plannedDistanceKm": 87.5,
  "trackingEnabled": true
}
```

Создаёт смену на **сегодня** (UTC-календарный день, как и `visits/day`) или возвращает активную существующую.

### `POST /field/shifts/:id/end`

Завершение смены.

### `POST /field/shifts/:id/samples`

Батч точек трека:

```json
{
  "items": [
    {
      "lat": 50.45,
      "lng": 30.52,
      "accuracyM": 18,
      "clientRecordedAt": "2026-05-15T08:05:00.000Z"
    }
  ],
  "clientMutationId": "optional-uuid-for-offline-retry"
}
```

Лимит: до **250** точек за запрос. Смена должна быть `ACTIVE` и `trackingEnabled: true`. Сервер фильтрует сэмплы (accuracy ≤ 150 м, дедуп &lt; 15 м, анти-glitch &gt; 150 км/ч).

Ответ: `{ "created": number, "rejected": number }`.

### `GET /field/shifts/:id/samples`

Список сохранённых точек (`since`, `limit`, `hasMore`). Лимит чтения — 500 за запрос.

### `GET /field/shifts/:id/track-geometry`

Геометрия трека смены для карты (snap к дорогам где возможно):

```json
{
  "sampleCount": 42,
  "path": [{ "lat": 50.45, "lng": 30.52 }],
  "source": "google",
  "distanceKm": 12.3
}
```

`source`: `"google"` | `"fallback"` | `"none"`.

### `GET /field/shifts/active`

Активная смена текущего пользователя или `null`. С `?scope=team` — активные смены команды (для карты руководителя).

## Fuel: дневной отчёт

### `GET /field/fuel/day?date=YYYY-MM-DD`

Возвращает `report`, `profile`, `breakdown` (визиты из снимка), `warnings`, `plannedMetrics`, `factMetrics`. Создаёт отчёт при отсутствии.

Опционально `ownerId` — для ADMIN/LEAD (чужой менеджер).

### `POST /field/fuel/day/recalculate?date=YYYY-MM-DD`

Пересчёт: плановые км из `RoutePlan`, **компенсация** по приоритету:

1. **GPS-трек** (`track`) — если за день есть смена с `trackingEnabled`, ≥ 2 отфильтрованных сэмпла, длина полилинии ≥ 0.5 км
2. **Маршрут по завершённым визитам** (`google` / `fallback`) — если трек недостаточен
3. **`none`** — недостаточно данных

В `calculationSnapshot` сохраняются `trackKm`, `visitRouteKm`, `trackMetricsSource`, `compensationFactKind`.

### `PATCH /field/fuel/day?date=YYYY-MM-DD`

Тело: `{ "compensationStatus": "SUBMITTED", "managerNote": "..." }` — отправка черновика.

### `GET /field/fuel/range?from=&to=`

Сводка за период (макс. 31 день): `totals`, `days[]`, `profile`, `owner`.

### `GET /field/fuel/export?from=&to=&format=csv|xlsx`

Файл выгрузки (CSV или XLSX с листами «По дням» и «Визиты»). В сводке по дням добавлены колонки `Refuel count`, `Refuel liters`, `Refuel amount UAH`.

## Fuel: заправки с фото чека

### `GET /field/fuel/refuels?date=YYYY-MM-DD`

Список заправок за день: `{ items: FuelRefuelEntry[], totals: { count, liters, amount } }`.

Опционально `ownerId` — для ADMIN/LEAD.

### `POST /field/fuel/refuels?date=YYYY-MM-DD`

Multipart: поле **`file`** (обязательно), поля формы **`liters`**, **`amount`**.

Без фото чека заправку создать нельзя (`400`). Лимиты: до 10 заправок/день, фото до 5 MB (`image/jpeg`, `image/png`, `image/webp`, `image/heic`).

Ответ: `{ item: FuelRefuelEntry }`.

### `DELETE /field/fuel/refuels/:id`

Удаление заправки и файла чека. Владелец или ADMIN; нельзя после статуса отчёта `PAID`.

### `GET /field/fuel/refuels/:id/receipt`

Поток изображения чека (требуется авторизация).

`GET /field/fuel/day` и `GET /field/fuel/range` дополнительно возвращают `refuels` / `refuelTotals` и `refuelCount` / `refuelAmountTotal` по дням.

## Профиль авто менеджера

### `GET /field/profile`

### `PATCH /field/profile`

```json
{
  "fuelLitersPer100km": 7.8,
  "fuelPricePerLiter": 58.5,
  "vehicleLabel": "Toyota Corolla",
  "usePersonalCar": true
}
```

## Офлайн (контракт клиента)

1. Идемпотентные локальные `clientMutationId` (UUID) для повторной отправки.
2. Очередь: `visitStart`, `visitComplete`, `shiftSamplesBatch`.
3. При конфликте статуса визита — сервер отвечает `409`; клиент перезагружает визит.

Детальный SDK sync — во **второй** версии; контракт полей уже совместим с буферизацией.

## Геометрия маршрута (web / mobile карты)

### `GET /route-plans/geometry/bundle?date=YYYY-MM-DD&ownerId=...&traffic=1`

Возвращает `planned`, `fact_visits`, `fact_gps` и `compensationFactKind` — какой источник используется для выплаты топлива.
