# Выпуск релиза в Git (чеклист)

Актуальная линия registry: **`0.2.x`**. Рекомендуемый стабильный patch для продакшена: **`v0.2.2`** / **`0.2.2`** (образы после успешного **Publish Registry Release**). Теги **`0.2.0`** / при необходимости ранний **`0.2.1`** для **`crm-backend-core`** не используйте на бою — см. `CHANGELOG.md` **[0.2.2]**. Предыдущая линия **`0.1.x`** — для клиентов до перехода.

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

git tag -a v0.2.2 -m "Release 0.2.2"
git push origin v0.2.2
```

После `git push origin v0.2.2` запустится workflow **Publish Registry Release** (триггер `push` тегов `v*`).

Для **`v0.2.*`** при пустом поле **modules** в workflow собираются **все** опциональные module-образы (см. `publish-release.yml` и `CHANGELOG.md`).

## Альтернатива: без тега

**Actions → Publish Registry Release → Run workflow** — поле `version`: `0.2.2`, при необходимости поле **modules** (пусто для `0.2.x` = все модули), ветка с нужным коммитом.

## После успешного CI

- Обновить у клиентов **`BACKEND_VERSION` / `WEB_VERSION` / `STORE_VERSION`** в `.env` на **`0.2.2`**, `docker compose pull` и перезапуск.
- При наличии новых миграций в релизе: **`prisma migrate deploy`** на стороне клиента (или сервис `backend-migrate` в compose).

Подробности про semver и совместимость: `docs/git-release-workflow.md`, `README.md` (раздел registry / compatibility).
