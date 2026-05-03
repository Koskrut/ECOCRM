# Core ↔ module internal auth (v0)

Стартовый контракт из плана **Core Image + Module Images**: общий секрет в env / манифесте CP, ротация через redeploy. Асимметричный JWT / Vault — отдельная hardening-фаза.

## Переменные

| Переменная | Где задаётся | Назначение |
|------------|--------------|------------|
| `OUTBOUND_UPSTREAM_URL` | только **`backend`** при образе **`crm-core-api`** | Базовый URL модуля (например `http://backend-outbound:3001`): core проксирует туда `/outbound` и `/integrations/outbound-voice` |
| `MODULE_INTERNAL_SECRET` | `backend` (core) и опционально `backend-outbound` | Общий секрет: core при проксировании добавляет заголовок `x-crm-module-internal`; модуль может проверять его в будущем |

## HTTP (core → module)

1. Браузер и `apps/web` по-прежнему бьют в **один** `API_URL` (core).
2. Core (`core-main`) при непустом `OUTBOUND_UPSTREAM_URL` монтирует reverse-proxy на префиксы **`/outbound`** и **`/integrations/outbound-voice`** к upstream (те же пути на контейнере модуля). Заголовки вроде `Authorization` пробрасываются как есть.
3. Если задан `MODULE_INTERNAL_SECRET`, core добавляет **`x-crm-module-internal`**. Проверка на стороне модуля — опциональное усиление (JWT для пользовательских запросов остаётся основным).

## Текущее состояние репозитория

Прокси реализован в `apps/backend/src/proxy/module-upstream-proxy.setup.ts` и подключается из `core-main.ts`. В `compose.modules.outbound-sidecar.yml` для `backend` проброшен `OUTBOUND_UPSTREAM_URL` из `.env` (задайте `http://backend-outbound:3001` при связке core + sidecar).
