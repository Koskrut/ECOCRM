# После обновления: что и где проверить (модули / compose)

Контекст: install bundle вроде **`/opt/crm`**, env **`suprex/.env`**, манифест с CP или **`deployment-manifest.json`**.

## 1. Манифест (JSON)

**Где:** ответ CP (**`MANIFEST_URL`**), файл **`DEPLOYMENT_MANIFEST_PATH`**, или **`/opt/crm/deployment-manifest.json`**.

**Проверить:**

| Поле | Ожидание |
|------|----------|
| **`composeFiles`** | Непустой массив; для полного релиза **0.2.x** с модулями — не только `compose.base.yml` + `compose.client.yml`, но и **`compose.modules.*.yml`** (несколько штук). |
| **`composeFileUrls`** | Объект; **у каждого** имени из **`composeFiles`** есть строка **`https://…`**. |
| **`images`** | Есть строки с ролями **`module`** / **`module_outbound`** и тегами **`…:ВАША_ВЕРСИЯ`** (например **0.2.3**). |
| **`moduleCodes`** | Содержит **`core.crm`** и коды модулей (**`ext.voice_outbound`**, **`int.google_sheet`**, …), если модули заявлены в релизе. |

Если **`composeFiles`** короткий — проблема на стороне CP (сохранение/отдача манифеста) или устаревший JSON; см. **`docs/cp-v0.2.3.md`**.

## 2. Файлы на диске

**Где:** корень bundle, например **`/opt/crm/`**.

**Проверить:**

```bash
cd /opt/crm
# подставьте список из манифеста composeFiles:
for f in compose.base.yml compose.client.yml; do test -f "$f" && echo "OK $f" || echo "MISSING $f"; done
```

Для каждого пути из **`composeFiles`** файл должен существовать (после **`client-pull-agent`** или **`git pull`**).

## 3. Переменные `.env`

**Где:** **`suprex/.env`** (или путь из **`ENV_FILE`**).

**Проверить:**

- **`BACKEND_VERSION`**, **`WEB_VERSION`**, **`STORE_VERSION`** — совпадают с релизом в registry (например **0.2.3**).
- При необходимости имена образов модулей (**`*_MODULE_IMAGE_NAME`**) — см. соответствующие **`compose.modules.*.yml`**.

## 4. Docker: тот же набор `-f`, что в манифесте

**Где:** та же машина, где крутится стек.

**Проверить:** список сервисов после **pull + up** (порядок **`-f`** должен совпадать с **`composeFiles`** в манифесте):

```bash
cd /opt/crm
# пример: соберите -f из манифеста вручную или скопируйте из лога агента
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
4. Если контейнеры есть, а API «без модуля» → **`license.json`** + **`MODULE_GATING_ENABLED`**.
