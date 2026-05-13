# Выпуск релиза в Git (чеклист)

Актуальная линия registry: **`0.2.x`**. Рекомендуемый стабильный patch для продакшена: **`v0.2.3`** / **`0.2.3`** (образы после успешного **Publish Registry Release**). Теги **`0.2.0`** / при необходимости ранние **`0.2.1`** / **`0.2.2`** для **`crm-backend-core`** на бою не используйте без необходимости — см. `CHANGELOG.md` **[0.2.3]** и **[0.2.2]**. Предыдущая линия **`0.1.x`** — для клиентов до перехода.

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

git tag -a v0.2.3 -m "Release 0.2.3"
git push origin v0.2.3
```

После `git push origin v0.2.3` запустится workflow **Publish Registry Release** (триггер `push` тегов `v*`).

Для **`v0.2.*`** при пустом поле **modules** в workflow собираются **все** опциональные module-образы (см. `publish-release.yml` и `CHANGELOG.md`).

## Альтернатива: без тега

**Actions → Publish Registry Release → Run workflow** — поле `version`: `0.2.3`, при необходимости поле **modules** (пусто для `0.2.x` = все модули), ветка с нужным коммитом.

## После успешного CI

- Обновить у клиентов **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** в `.env` на **`0.2.3`**, `docker compose pull` и перезапуск.
- При наличии новых миграций в релизе: **`prisma migrate deploy`** на стороне клиента (или сервис `backend-migrate` в compose).

## Compose на сервере клиента (SUPREX / install bundle)

Манифест релиза из **Publish Registry Release** содержит **`composeFileUrls`**: прямые `https://raw.githubusercontent.com/.../gitSha/<файл>` для **каждого** пути из **`composeFiles`**, чтобы не собирать compose вручную по модулям.

- Скрипт **`suprex/client-pull-agent.sh`** (из корня bundle, как у вас `/opt/crm`): подставляет манифест (`MANIFEST_URL` или `DEPLOYMENT_MANIFEST_PATH` или `deployment-manifest.json` в корне), вызывает **`scripts/sync-compose-from-manifest.mjs`**, затем **`docker compose pull`** со всеми `-f` из манифеста. Пример:
  - `cd /opt/crm && ENV_FILE=suprex/.env MANIFEST_URL='https://…/deployment-manifest.json' ./suprex/client-pull-agent.sh`
- Чтобы только скачать compose без pull: **`SKIP_DOCKER_PULL=1`**.
- Control Plane должен **сохранять и отдавать** поле **`composeFileUrls`** при регистрации релиза (как в JSON из CI). Чеклист по CP: **`docs/cp-v0.2.3.md`**. Если CP обрезает неизвестные поля — обновите CP или временно кладите актуальный `deployment-manifest.json` в корень bundle.

Подробности про semver и совместимость: `docs/git-release-workflow.md`, `README.md` (раздел registry / compatibility).
