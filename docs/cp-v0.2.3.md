# Control Plane и сервер: манифест релиза (**0.2.99+**), compose, лицензия

Кратко для операторов. Расширенный preflight по CP — в репозитории **Control Plane**: **`docs/releasing-manifest.md`** (в т.ч. §8 preflight CP, §9 события **`/rollouts/.../events`**), **`docs/deployment-manifest-compose-patch.md`**.

---

## Манифест и лицензия — развести явно

| Слой | За что отвечает | Где смотреть |
| --- | --- | --- |
| **Манифест релиза** (`composeFiles`, `composeFileUrls`, образы, `gitSha`…) | Какой **stack** поднять: какие compose overlay и какие **образы** с registry | CP → регистрация CI / `rollouts/next` / `MANIFEST_URL` |
| **Лицензия / entitlement** | Какие **модули разрешены в CRM** (UI, API, `ext.*` / `int.*`) | Подписка в CP → **activate / phone-home** → подписанный envelope на стороне CRM (`license.json` и т.д.) |

**Важно:** подписанный entitlement при **activate / phone-home** собирается из **подписки** (bundle + extra → **effectiveModuleCodes**), **а не** из поля **`moduleCodes`** на `DeploymentManifest`. Поле **`moduleCodes`** в манифесте — отдельно (релиз / каталог / документация для агента); с модулями в JWT оно **не обязано** совпадать, если у вас нет отдельной бизнес-логики «синхронизировать с манифестом». Если модули «логически выключены» в продукте — смотреть **подписку + сохранение entitlement в CRM**, а не только манифест.

---

## Control Plane — манифест и отдача

1. **`composeFiles`** — полный список overlay под релиз: **`compose.base.yml`**, **`compose.client.yml`**, **`compose.modules.store.yml`**, затем module compose из релиза (не только base + client). Если в CP есть allowlist имён compose-файлов, добавьте **`compose.modules.store.yml`**.
2. **`composeFileUrls`** — у **каждого** элемента **`composeFiles`** своя строка **`https://…`** (в т.ч. при политиках **`passthrough`** / **`ci_urls`** на PATCH — см. ниже).
3. **`gitSha` vs URL в raw:** в raw-URL часто встречается ref вида **`v0.2.99`**, в манифесте — **полный коммит**; это **нормально**, если вы осознанно публикуете оба ref и **содержимое файлов** на GitHub совпадает с релизом.
4. После **`POST …/releases/register`**: **`composeFileUrls`** и неизвестные корневые поля CI **не выкидываются молча** — в CP лишнее с корня может уходить в **`metadata.ci_unknown_root_fields`** (проверяйте при отладке).
5. Клиентский путь (**`MANIFEST_URL`**, **`rollouts/next` → rollout.manifest**, админка) должен отдавать **те же** **`composeFiles`** / **`composeFileUrls`**, что сохранили после регистрации.

### Урезанный манифест

**`PATCH …/deployment-manifests/:id/compose`** с **`policy: "passthrough"`** или **`"ci_urls"`** — см. **`docs/deployment-manifest-compose-patch.md`**.

### Продакшен CP

Образ API + **`prisma migrate deploy`** (колонка **`compose_file_urls`**, код passthrough / отдача манифеста).

---

## Сервер (install bundle / Suprex)

1. **Репозиторий и тег** — согласованы с релизом (например **`v0.2.99`**), есть **`scripts/sync-compose-from-manifest.mjs`** и **`suprex/client-pull-agent.sh`**.
2. **Манифест на вход агента** — полный JSON с **`composeFileUrls`** (например **16** файлов для полного **0.2.x** с store и всеми модулями: base + client + **store** + overlays). Нормально **не** класть **`deployment-manifest.json`** в корень bundle, если всегда задаёте **`MANIFEST_URL`** или **`DEPLOYMENT_MANIFEST_PATH`**. Не подсовывать **старый** JSON без **`composeFileUrls`**, если sync должен тянуть YAML с GitHub.
3. **`.env`** — **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** = версия релиза; **`CORS_ORIGIN`**, **`PUBLIC_BASE_URL`**, секреты БД; **`*_MODULE_IMAGE_NAME`** можно не задавать (дефолты в compose).
4. **`MODULE_GATING_ENABLED`** — если не задан / пусто, гейтинг по env обычно не включает жёсткий режим; при **`true`** дополнительно проверяйте pilot / enabled в БД и health апстримов (как в вашем чеклисте).
5. **Compose на диске** — все пути из **`composeFiles`** присутствуют в корне bundle (после sync или git).
6. **Docker** — **`docker compose pull`** и **`up -d`** с **тем же** набором **`-f`**, что в манифесте (включая **`store`**, если он в **`composeFiles`**); модули в **`docker compose ps`** — **`up` / healthy**. Если сервис был в старом стеке, а из манифеста убран — **`docker compose … up -d --remove-orphans`**.
7. **Лицензия (UI/API модулей)** — **`LICENSE_FILE_PATH_HOST`** (и **`LICENSE_FILE_PATH`** в контейнере) должны указывать на **файл** `license.json` с подписанным envelope и нужными **`ext.*` / `int.*`** в payload, а **не на каталог**. Если путь ведёт на директорию, монтирование/чтение лицензии ломаются; в API возможен сценарий «effective только **core.crm**».

8. **Модули-сайдкары из манифеста** (NP и др.): если в **`composeFiles`** есть **`compose.modules.np-sidecar.yml`**, на сервисе **`backend`** в `.env` нужен **`NP_UPSTREAM_URL=http://backend-np:3001`** (и обычно **`NP_WRITES_DISABLED=true`** на монолите), иначе прокси **`/np`** на воркер **не включится**. Убрать воркер и оставить только монолит — меняют **манифест в CP** (`composeFiles` / PATCH), не агент на bundle. **Phone-home** обновит версию в CP после обычного цикла; при необходимости один раз перезапустите **`backend`**.

---

**Запуск агента:** **`docs/RELEASING.md`** (`ENV_FILE`, `MANIFEST_URL`, при необходимости **`SKIP_DOCKER_PULL=1`**).
