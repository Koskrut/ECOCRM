# Выпуск релиза в Git (чеклист)

Последний **git**-тег на `origin`: **`v0.1.4`**. Образы **`0.1.5`** уже в registry (могли быть собраны вручную без тега). Следующий patch в линии **0.1.x** в репозитории и для новых образов: **`v0.1.6`** / **`0.1.6`**.

## Перед тегом

1. **Закоммитьте** все изменения, которые должны войти в релиз (включая `CHANGELOG.md`, версии в `package.json`).
2. **Запушьте ветку** на `origin` (часто `main` или ваша релизная ветка, согласованная с командой).
3. Убедитесь, что в GitHub заданы секреты для **Publish Registry Release** (`CONTROL_PLANE_*`, `GITHUB_TOKEN` для GHCR и т.д.).
4. Опционально: **Preflight Release Build** в Actions — проверка сборки без пуша образов.

## Поставить тег (основной способ)

На коммите, который **уже на remote**:

```bash
git fetch origin
git checkout <ваша-ветка-релиза>   # например main
git pull origin <ваша-ветка-релиза>

git tag -a v0.1.6 -m "Release 0.1.6"
git push origin v0.1.6
```

После `git push origin v0.1.6` запустится workflow **Publish Registry Release** (триггер `push` тегов `v*`).

## Альтернатива: без тега

**Actions → Publish Registry Release → Run workflow** — поле `version`: `0.1.6`, ветка с нужным коммитом.

## После успешного CI

- Обновить у клиентов **`BACKEND_VERSION` / `WEB_VERSION` / …** в `.env` на `0.1.6`, `docker compose pull` и перезапуск.
- При наличии новых миграций в релизе: **`prisma migrate deploy`** на стороне клиента.

Подробности про semver и совместимость: `docs/git-release-workflow.md`, `README.md` (раздел registry / compatibility).
