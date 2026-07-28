# Выпуск релиза в Git (чеклист)

Актуальная линия registry: **`0.2.x`**. Рекомендуемый стабильный patch для продакшена: **`v0.2.123`** / **`0.2.123`** (образы после успешного **Publish Registry Release**). Более старые патчи **`0.2.0`** … **`0.2.91`** для **`crm-backend-core`** на бою не рекомендуются без причины — см. `CHANGELOG.md` **[0.2.123]** и предыдущие секции. Предыдущая линия **`0.1.x`** — для клиентов до перехода.

## Перед тегом

1. **Закоммитьте** все изменения, которые должны войти в релиз (включая `CHANGELOG.md`, версии в `apps/*/package.json`).
2. **Запушьте ветку** на `origin` (часто `main` или ваша релизная ветка, согласованная с командой).
3. Убедитесь, что в GitHub заданы секреты для **Publish Registry Release** (`CONTROL_PLANE_URL`, `CONTROL_PLANE_CI_TOKEN` и т.д.).
4. Опционально: **Preflight Release Build** в Actions — проверка сборки без пуша образов.

## Поставить тег (основной способ)

На коммите, который **уже на remote**:

```bash
git fetch origin
git checkout <ваша-ветка-релиза>   # например main
git pull origin <ваша-ветка-релиза>

git tag -a v0.2.123 -m "Release 0.2.123"
git push origin v0.2.123
```

После `git push origin v0.2.123` запустится workflow **Publish Registry Release** (триггер `push` тегов `v*`). Для **`v0.2.*`** при пустом **modules** в dispatch собираются **все** module-образы и полный манифест compose.

Для **`v0.2.*`** при пустом поле **modules** в workflow собираются **все** опциональные module-образы (см. `publish-release.yml` и `CHANGELOG.md`).

## Альтернатива: без тега

**Actions → Publish Registry Release → Run workflow** — поле `version`: `0.2.123`, при необходимости поле **modules** (пусто для `0.2.x` = все модули), ветка с нужным коммитом.

## После успешного CI

- Обновить у клиентов **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** в `.env` на **`0.2.123`**, `docker compose pull` и перезапуск.
- При наличии новых миграций в релизе: **`prisma migrate deploy`** на стороне клиента (или сервис `backend-migrate` в compose).

## Compose на сервере клиента (SUPREX / install bundle)

Манифест релиза из **Publish Registry Release** содержит **`composeFileUrls`** для **`compose.base.yml`**, **`compose.client.yml`**, **`compose.modules.store.yml`** и всех module overlays из релиза (`0.2.x` — полный набор модулей): прямые `https://raw.githubusercontent.com/.../…/<файл>` для **каждого** пути из **`composeFiles`**, чтобы не собирать compose вручную по модулям.

- Скрипт **`suprex/client-pull-agent.sh`** (из корня bundle, как у вас `/opt/crm`): подставляет манифест (`MANIFEST_URL` или `DEPLOYMENT_MANIFEST_PATH` или `deployment-manifest.json` в корне), вызывает **`scripts/sync-compose-from-manifest.mjs`**, затем **`docker compose pull`** со всеми `-f` из манифеста. Пример:
  - `cd /opt/crm && ENV_FILE=suprex/.env MANIFEST_URL='https://…/deployment-manifest.json' ./suprex/client-pull-agent.sh`
- Чтобы только скачать compose без pull: **`SKIP_DOCKER_PULL=1`**.
- Control Plane должен **сохранять и отдавать** поле **`composeFileUrls`** при регистрации релиза и в ответах вроде **`rollouts/next`** (как в JSON из CI); неизвестные корневые поля CI в CP могут уходить в **`metadata.ci_unknown_root_fields`** — проверяйте при отладке. Хотфикк compose: **`PATCH …/deployment-manifests/:id/compose`** с **`policy: "passthrough"`** или **`"ci_urls"`**. Полный разбор **манифест vs лицензия**, **`moduleCodes` vs подписка`**, чеклист сервера — **`docs/cp-v0.2.3.md`**; в CP — **`docs/releasing-manifest.md`**, **`docs/deployment-manifest-compose-patch.md`**. Если CP обрезает поля — обновите схему/миграции или временно кладите актуальный `deployment-manifest.json` в корень bundle.

Подробности про semver и совместимость: `docs/git-release-workflow.md`, `README.md` (раздел registry / compatibility).
