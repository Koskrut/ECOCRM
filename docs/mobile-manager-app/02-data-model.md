# Модель данных (Prisma / PostgreSQL)

## Существующие сущности CRM

- **Visit** — плановая точка `lat`/`lng`, `radiusM`, статусы, `startedAt`/`completedAt`.
- **RoutePlan** / **RouteStop** — план дня и порядок визитов, метрики Google Routes (`route-plans.service.ts`).

## Новые перечисления

- **VisitGpsVerification** — `VERIFIED`, `NEARBY_WARNING`, `OUTSIDE_RADIUS`, `MANUAL_REVIEW`, `NO_FIX`.
- **VisitGpsEventKind** — `START`, `COMPLETE`.
- **FieldShiftStatus** — `ACTIVE`, `ENDED`.
- **FuelCompensationStatus** — `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `PAID`.

## Новые модели

### VisitGpsEvent

Аудит каждого GPS-пинга при старте/завершении визита.

| Поле | Назначение |
|------|------------|
| `visitId`, `kind` | Привязка к визиту и тип события |
| `lat`, `lng`, `accuracyM` | Координаты и точность |
| `clientRecordedAt` | Время по устройству |
| `permissionState`, `locationProvider` | Метаданные клиента |
| `distanceToPlannedM` | Расстояние до плановой точки визита |
| `verification` | Итог проверки |

### Visit (дополнения)

| Поле | Назначение |
|------|------------|
| `startGpsVerification` | Последний статус для старта |
| `completeGpsVerification` | Последний статус для завершения |

### UserFieldProfile (1:1 с User)

| Поле | Назначение |
|------|------------|
| `fuelLitersPer100km` | Норма расхода |
| `fuelPricePerLiter` | Цена за литр (оценка компенсации) |
| `vehicleLabel` | Подпись авто |
| `usePersonalCar` | Личное/служебное (для политик) |

### FieldShift

Рабочая смена для политики трекинга и группировки сэмплов.

| Поле | Назначение |
|------|------------|
| `ownerId`, `date` | Менеджер и календарный день |
| `status`, `startedAt`, `endedAt` | Жизненный цикл |
| `trackingEnabled` | Разрешён ли фоновый трек |
| `plannedDistanceKm` | Снимок плана (для топлива MVP) |

### FieldLocationSample

Точки трека внутри смены (v2: агрегация пробега; v1: запись уже поддерживается API).

### FuelDayReport

Один документ «топливо за день» на пользователя: план км, расчёт литров/суммы, статус компенсации, опционально `shiftId`.

## Связи

- `User` → `fieldShifts`, `fuelDayReports`, опционально `fieldProfile`.
- `Visit` → `visitGpsEvents[]`.

Схема: [apps/backend/prisma/schema.prisma](../../apps/backend/prisma/schema.prisma).
