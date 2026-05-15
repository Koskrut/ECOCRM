# После обновления: что и где проверить (модули / compose)

Контекст: install bundle вроде **`/opt/crm`**, env **`suprex/.env`**, манифест с CP или **`deployment-manifest.json`**.

Актуализировано под зелёный релиз **`v0.2.61`** (полный манифест CI: **store** + overlays модулей, **`composeFileUrls`**, NP и Google Drive в Settings — см. **`CHANGELOG.md` [0.2.61]**).

## 0. Rollout после зелёного **Publish Registry Release** (CP → сервер)

1. **Control Plane:** для установки выставлен целевой релиз **`0.2.61`**; **`rollouts/next`** (или выдача **`MANIFEST_URL`**) возвращает JSON с **`version`: `0.2.61`**, полным **`composeFiles`** (в т.ч. **`compose.modules.store.yml`**) и **`composeFileUrls`** на каждый путь.
2. **Сервер:** в **`suprex/.env`** — **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION` = `0.2.61`** (и остальные секреты без изменений, если не требует релиз).
3. **Синк compose + образы:**  
   `cd /opt/crm && ENV_FILE=suprex/.env MANIFEST_URL='…' ./suprex/client-pull-agent.sh`  
   (или **`DEPLOYMENT_MANIFEST_PATH`** / локальный **`deployment-manifest.json`**).
4. **Поднять стек:** **`docker compose … up -d`** с **тем же** набором **`-f`**, что в **`composeFiles`** манифеста (после **`pull`** иначе новые **`backend-*`** не появятся); при смене состава — **`--remove-orphans`** по необходимости.
5. **Миграции:** если в релизе были Prisma-миграции — **`backend-migrate`** / **`prisma migrate deploy`** до **`up`** (как у вас принято).
6. **NP (0.2.6+):** ключ и отправитель — в **Settings → Nova Poshta** (БД), не только env; см. **`docs/np-module-prod.md`**. При **`backend-np`** в манифесте — **`NP_UPSTREAM_URL`** на **`backend`**.
7. **Google Drive (0.2.61+):** папка и service account — **Settings → Google-таблиця** (или env **`GOOGLE_*`** в compose).

## 1. Манифест (JSON)

**Где:** ответ CP (**`MANIFEST_URL`**), файл **`DEPLOYMENT_MANIFEST_PATH`**, или **`/opt/crm/deployment-manifest.json`**.

**Проверить:**

| Поле | Ожидание |
|------|----------|
| **`composeFiles`** | Непустой массив; для полного релиза **0.2.x** с модулями — не только `compose.base.yml` + `compose.client.yml`, но и **`compose.modules.*.yml`** (несколько штук). |
| **`composeFileUrls`** | Объект; **у каждого** имени из **`composeFiles`** есть строка **`https://…`**. |
| **`images`** | Есть строки с ролями **`module`** / **`module_outbound`** / **`store`** и тегами **`…:ВАША_ВЕРСИЯ`** (для текущего патча — **`0.2.61`**). |
| **`moduleCodes`** | Содержит **`core.crm`** и коды модулей (**`ext.voice_outbound`**, **`int.google_sheet`**, …), если модули заявлены в релизе. |

Если **`composeFiles`** короткий — проблема на стороне CP (сохранение/отдача манифеста) или устаревший JSON; см. **`docs/cp-v0.2.3.md`**.

## 2. Файлы на диске

**Где:** корень bundle, например **`/opt/crm/`**.

**Проверить:**

```bash
cd /opt/crm
# все пути из манифеста (нужен jq) — для полного 0.2.x обычно 16 файлов:
MANIFEST="${MANIFEST:-deployment-manifest.json}"
jq -r '.composeFiles[]' "$MANIFEST" | while read -r f; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done
```

Без **`jq`:** вручную пройдите каждый элемент **`composeFiles`** из JSON. Для каждого пути файл должен существовать (после **`client-pull-agent`** или **`git pull`**).

## 3. Переменные `.env`

**Где:** **`suprex/.env`** (или путь из **`ENV_FILE`**).

**Проверить:**

- **`BACKEND_VERSION`**, **`WEB_VERSION`**, **`STORE_VERSION`** — совпадают с релизом в registry (целевой патч линии **0.2.x**, сейчас **`0.2.61`**).
- При необходимости имена образов модулей (**`*_MODULE_IMAGE_NAME`**) — см. соответствующие **`compose.modules.*.yml`**.

## 4. Docker: тот же набор `-f`, что в манифесте

**Где:** та же машина, где крутится стек.

**Проверить:** список сервисов после **pull + up** (порядок **`-f`** должен совпадать с **`composeFiles`** в манифесте):

```bash
cd /opt/crm
# реальный список -f — из composeFiles манифеста (ниже только иллюстрация двух файлов):
docker compose -f compose.base.yml -f compose.client.yml --env-file suprex/.env config --services
docker compose … --env-file suprex/.env ps
```

**Ожидание:** для включённых в compose модулях есть сервисы вроде **`backend-outbound`**, **`backend-google-sheet`**, … Если их **нет** — вы не делали **`up -d`** с полным набором overlay или в манифесте нет их **`compose.modules.*`**.

Важно: **`docker compose pull`** сам по себе **не создаёт** новые сервисы; после pull нужен **`up -d`** с теми же **`-f`**.

## 5. Лицензия и гейтинг (если «модуля нет» в UI / 404)

**Где:** **`license.json`** (путь из **`LICENSE_FILE_PATH`** / mount в compose), переменная **`MODULE_GATING_ENABLED`** в env, настройки модулей в БД.

**Проверить:**

- В **`license.json`** есть нужные **`moduleCodes`** / расширения (например **`ext.finance`**), файл не протух и подписан.
- **`MODULE_GATING_ENABLED`**: при **`true`** доступ к маршрутам зависит от enabled в БД — см. **`README.md`** (модульность / gating).

## 6. Агент

**Где:** **`./suprex/client-pull-agent.sh`** из **`/opt/crm`**.

**Проверить:** запуск с **`MANIFEST_URL`** (или путём к JSON), без ошибок про отсутствующие compose; при отладке только compose: **`SKIP_DOCKER_PULL=1`**.

Детали вызова: **`docs/RELEASING.md`**, **`suprex/README.md`**.

## Быстрая диагностика

1. Манифест: полный **`composeFiles`** + **`composeFileUrls`**?  
2. На диске: все эти yaml есть?  
3. **`docker compose ps`**: есть **`backend-*`** модулей?  
4. После rollout: **`GET /system/modules`** (или эквивалент в вашем BFF) — ожидаемый набор enabled / entitlements.  
5. Если контейнеры есть, а API «без модуля» → **`license.json`** + **`MODULE_GATING_ENABLED`**.
