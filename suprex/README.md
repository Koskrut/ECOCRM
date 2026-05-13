# SUPREX client bundle helpers

Файлы в этом каталоге предназначены для **install bundle** на сервере клиента (корень репозитория = родитель `suprex/`, например `/opt/crm`).

## `client-pull-agent.sh`

1. Берёт манифест релиза (**`MANIFEST_URL`**, **`DEPLOYMENT_MANIFEST_PATH`**, или **`deployment-manifest.json`** в корне bundle).
2. Вызывает **`scripts/sync-compose-from-manifest.mjs`**: для каждого пути из **`composeFiles`** скачивает файл с **`composeFileUrls`**, если его ещё нет локально (поле заполняется при **Publish Registry Release** в ECOCRM).
3. Запускает **`docker compose … pull`** со всеми `-f` из манифеста.

Пример:

```bash
cd /opt/crm
ENV_FILE=suprex/.env MANIFEST_URL='https://your-control-plane/.../manifest.json' ./suprex/client-pull-agent.sh
```

Только скачать compose без `docker pull`: **`SKIP_DOCKER_PULL=1`**.

Control Plane должен **сохранять** поле **`composeFileUrls`** в JSON манифеста при регистрации релиза; иначе используйте локальный экспорт манифеста из CI или файл в корне bundle.

После обновления модули «не подтягиваются» — чеклист: **`docs/suprex-post-update-checklist.md`**.
