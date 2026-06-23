# SUPREX client bundle helpers

Файлы в этом каталоге предназначены для **install bundle** на сервере клиента (корень репозитория = родитель `suprex/`, например `/opt/crm`).

## Автооновлення (Settings → Стан системи)

Після релізу **0.2.78+** у `compose.client.yml` є сервіс **`updater`**. Backend за замовчуванням:

- `UPDATER_AGENT_URL=http://updater:7788`
- `AUTO_UPDATE_ENABLED=true` — перевірка Control Plane кожні 15 хв і автоматичний `pull`/`up`

У **`suprex/.env`** додайте (якщо ще немає):

```bash
UPDATER_ENV_FILE=/deploy/suprex/.env
UPDATER_MANIFEST_URL=https://…/api/installations/…/rollouts/next   # опційно, для sync compose overlays
AUTO_UPDATE_ENABLED=true
CONTROL_PLANE_URL=…
CONTROL_PLANE_INSTALLATION_ID=…
CONTROL_PLANE_INSTALLATION_TOKEN=…
```

Після `docker compose … up -d` з повним манифестом має з’явитися контейнер **`updater`** (потрібен **`/var/run/docker.sock`**). У Settings → Health з’явиться зелений блок «Автооновлення увімкнено».

Щоб вимкнути автооновлення: `AUTO_UPDATE_ENABLED=false`.

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

**Лицензия:** в `.env` переменная **`LICENSE_FILE_PATH_HOST`** должна указывать на **файл** `…/license.json`, а не на каталог `…/secrets/` — иначе модули в API/UI останутся «только core». Манифест релиза и entitlement из подписки — разные вещи; см. **`docs/cp-v0.2.3.md`**.
