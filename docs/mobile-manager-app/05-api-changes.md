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
  ]
}
```

Лимит разумного размера батча валидируется в сервисе.

### `GET /field/shifts/active`

Активная смена текущего пользователя или `null`.

## Fuel: дневной отчёт

### `GET /field/fuel/day?date=YYYY-MM-DD`

Возвращает `report`, `profile`, `breakdown` (визиты из снимка), `warnings`, `plannedMetrics`, `factMetrics`. Создаёт отчёт при отсутствии.

Опционально `ownerId` — для ADMIN/LEAD (чужой менеджер).

### `POST /field/fuel/day/recalculate?date=YYYY-MM-DD`

Пересчёт: плановые км из `RoutePlan`, фактические из завершённых визитов (`getFactRouteMetrics`), компенсация = факт, литры/сумма из `UserFieldProfile`.

### `PATCH /field/fuel/day?date=YYYY-MM-DD`

Тело: `{ "compensationStatus": "SUBMITTED", "managerNote": "..." }` — отправка черновика.

### `GET /field/fuel/range?from=&to=`

Сводка за период (макс. 31 день): `totals`, `days[]`, `profile`, `owner`.

### `GET /field/fuel/export?from=&to=&format=csv|xlsx`

Файл выгрузки (CSV или XLSX с листами «По дням» и «Визиты»).

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
