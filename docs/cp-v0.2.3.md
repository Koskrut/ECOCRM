# Control Plane: релиз **0.2.3** и манифест compose

Кратко для операторов. Детали хотфиксов и политик compose — в репозитории **Control Plane**: **`docs/releasing-manifest.md`**, **`docs/deployment-manifest-compose-patch.md`**.

## После CI (ECOCRM **Publish Registry Release**)

1. **Сохранять полный JSON** тела **`POST /api/ci/releases/register`**, включая **`composeFileUrls`**: для каждого элемента **`composeFiles`** — строка с **`https://…`** (как присылает CI). Не выкидывать «лишние» ключи при записи в БД, если храните JSON целиком.
2. **Отдача клиенту / rollouts:** в **`rollouts/next`** (и любых ответах, откуда bundle берёт манифест) возвращать **`composeFiles`** и **`composeFileUrls`** с теми же ключами, плюс нужные метаданные релиза — иначе **`MANIFEST_URL` + `client-pull-agent.sh`** не смогут скачать overlay compose (см. **`docs/RELEASING.md`** в ECOCRM).

## Старые релизы (до **0.2.3**)

У них **`composeFileUrls`** мог не сохраниться или не прийти из CI. Варианты:

- перевести установки на релиз **0.2.3+** и заново зарегистрировать манифест из CI; или  
- **хотфикк в CP:** **`PATCH …/deployment-manifests/:id/compose`** (см. CP **`docs/deployment-manifest-compose-patch.md`**).

## PATCH compose: `strict` vs `passthrough` / `ci_urls`

- **`strict`** (и схожие режимы): пути проходят через **`resolveComposeManifestPaths`** — только известные/санитизированные файлы.
- **`passthrough`** или **`ci_urls`**: вызывается **`passthroughComposeWithUrls`**, те же правила, что при регистрации из CI — у **каждого** пути из **`composeFiles`** в **`composeFileUrls`** должен быть **`https://`** URL; **лишние ключи** в **`composeFileUrls`** сохраняются. Удобно для хотфикса списка compose/URL без расширения строгого allowlist.

Тип **`body.policy`** в CP расширен: **`ComposeResolvePolicy | "passthrough" | "ci_urls"`**.

## Продакшен Control Plane

Как и раньше: выкатить **образ API** и выполнить **`prisma migrate deploy`**, чтобы на инстансе были колонка **`compose_file_urls`** (или эквивалент) и код с passthrough / отдачей манифеста.

---

**Клиент (install bundle):** **`MANIFEST_URL`** или локальный **`deployment-manifest.json`** + **`./suprex/client-pull-agent.sh`** — **`docs/RELEASING.md`** в ECOCRM.
