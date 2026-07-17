# Nginx + HTTPS для crm.suprex.dental, www.suprex.dental, api.suprex.dental и apex suprex.dental

## Целевая схема

**Рекомендуется:** `suprex.dental` (apex) только **301 → `https://www.suprex.dental`** — публичный магазин на `www`, CRM на `crm`, API на `api`. Так не пересекается default vhost с CRM и не нужен отдельный upstream для корня.

Альтернатива (редко): отдавать с apex тот же store, что и `www` — тогда в одном `server` укажите `server_name www.suprex.dental suprex.dental;` и расширьте сертификат на apex (без редиректа возможны дубли URL для SEO).

## 1. DNS

У регистратора / Cloudflare для suprex.dental:
- **suprex.dental** (apex, `@`) → A на IP сервера (как у `www`)
- **crm.suprex.dental** → A-запись на IP сервера
- **www.suprex.dental** → A-запись на IP сервера
- **api.suprex.dental** → A-запись на IP сервера

## 2. Установка nginx и certbot (если ещё нет)

```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
```

## 3. Копирование конфига

```bash
cd /opt/crm
sudo cp deploy/nginx/suprex.dental.conf /etc/nginx/sites-available/suprex.dental.conf
sudo ln -sf /etc/nginx/sites-available/suprex.dental.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Прокси без `Connection: upgrade` на каждый запрос

В `location /` для CRM (порт **3000**) и store (**3002**) **не** задавайте:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection 'upgrade';
```

Эти заголовки нужны только для отдельных WebSocket-локаций. Если nginx шлёт `Connection: upgrade` на обычные POST/GET, Next.js-прокси `/api/*` → backend может получать **пустое тело** запроса.

Актуальный шаблон в репозитории (`suprex.dental.conf`) уже без этих строк. После обновления CRM пересоберите конфиг с сервера и перезагрузите nginx:

```bash
cd /opt/crm && git pull   # или client-pull-agent / ваш способ доставки bundle
sudo cp deploy/nginx/suprex.dental.conf /etc/nginx/sites-available/suprex.dental.conf
# если certbot правил файл вручную — смержите SEO/webhook-блоки, но уберите Connection 'upgrade' из location /
sudo nginx -t && sudo systemctl reload nginx
```

Образ **web** с релиза, где в прокси вычищаются hop-by-hop заголовки (`connection`, `upgrade`, …), снижает риск даже при старом nginx, но **исправление nginx всё равно рекомендуется**.

### Лимит размера загрузок (`client_max_body_size`)

В шаблоне для CRM, store и API задано `client_max_body_size 50M;` — иначе nginx по умолчанию режет тело запроса на **~1 MB**. Тогда падают:

- полный файл остатков 1С (`остатки залить.xlsx`, часто **>1–2 MB**) → **413** на вкладке «Снапшоти»;
- мобильные фото чеков (заправка);
- BOM / sales Excel.

**Типичная причина на проде:** certbot создал отдельный `server { listen 443 ssl; ... }` **без** `client_max_body_size`, а в репозитории правка только в блоке `:80`. HTTPS тогда остаётся с дефолтом ~1M.

На сервере сразу во всех блоках `crm.suprex.dental` / `api.suprex.dental` (и `:80`, и `:443`):

```bash
sudo grep -n 'client_max_body_size\|server_name crm' /etc/nginx/sites-enabled/*
# если в 443-блоке нет лимита — добавьте:
sudo sed -i '/server_name crm.suprex.dental;/a\    client_max_body_size 50M;' /etc/nginx/sites-available/suprex.dental.conf
# или вручную в оба server {} для CRM:
```

```nginx
client_max_body_size 50M;
```

Проверка и reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

После обновления конфига на сервере продублируйте эту директиву и в HTTPS-блоках, которые certbot добавил вручную (`listen 443 ssl`), если их там нет.
## 4. Получить SSL-сертификаты

```bash
sudo certbot --nginx -d crm.suprex.dental -d www.suprex.dental -d api.suprex.dental -d suprex.dental
```

Certbot сам добавит в конфиг блоки `listen 443 ssl` и пути к сертификатам. Для **apex** после появления `server { listen 443 ssl; server_name suprex.dental; ... }` убедитесь, что внутри него задан редирект на магазин, например: `return 301 https://www.suprex.dental$request_uri;` (если certbot оставил заглушку или `proxy_pass` — замените вручную). Иначе при HTTPS с Cloudflare → origin запрос снова может попасть не в тот vhost.

После этого перезагрузите nginx:

```bash
sudo systemctl reload nginx
```

## 5. .env на сервере

В `/opt/crm/.env` должны быть строки (см. .env.production.example):

```
CORS_ORIGIN=https://crm.suprex.dental,https://www.suprex.dental,https://suprex.dental
PUBLIC_BASE_URL=https://api.suprex.dental
```

Дополнительно можно перечислить IP-оригины для отладки через запятую (как в `.env.production.example`). После **любой** смены `CORS_ORIGIN` пересоздайте/перезапустите контейнер backend, иначе Nest останется со старым значением:

```bash
cd /opt/crm
docker compose -f docker-compose.prod.yml --env-file .env up -d backend
```

## 6. Bitrix webhook (опционально)

Рекомендуемый URL для webhook в Bitrix24:

**https://api.suprex.dental/integrations/bitrix/webhook**

(Старый URL https://crm.suprex.dental/integrations/bitrix/webhook тоже работает, если в конфиге оставлен соответствующий location.)

Заголовок `x-bitrix-webhook-secret` — то же значение, что в `.env`: `BITRIX_WEBHOOK_SECRET`.

## 7. Проверка

- `curl -sI https://suprex.dental/` → **301**, `Location: https://www.suprex.dental/...`
- https://crm.suprex.dental — CRM, вход
- https://www.suprex.dental — магазин
- https://api.suprex.dental — бекенд (например, GET /health или любой публичный эндпоинт)
- CORS: `curl -sI -X OPTIONS 'https://api.suprex.dental/auth/login' -H 'Origin: https://www.suprex.dental' -H 'Access-Control-Request-Method: POST'` — в ответе должен быть `Access-Control-Allow-Origin` (повторите с `Origin: https://crm.suprex.dental` и при необходимости `https://suprex.dental`)

## 8. SEO cleanup для www.suprex.dental (после миграции с WordPress)

В `suprex.dental.conf` для **www** заданы:

| Pattern | Действие | Цель / результат | Причина |
|--------|----------|------------------|---------|
| Query **только** из `add-to-cart`, `per_page`, `per_row`, `shop_view`, `woo_ajax`, `loop` | **301** | Тот же path без query | Схлопнуть чистые параметрические дубли на уровне nginx |
| Тот же мусор **+** другие параметры (напр. `utm_*`) | — | Обрабатывает **Next.js middleware** в `apps/store` | В nginx нельзя безопасно вычеркнуть часть query и сохранить остальное |
| `/about-us-3` или `/about-us-3/` | **301** | `/about` | Старый WP-URL → актуальная сторінка |
| `/portfolio`, `/project-cat/*`, `/tag/*`, `/blog/*` | **410** | Тіло відповіді 410 | Контенту немає — явний сигнал пошуковикам |
| `/product-category/…`, `/shop/…`, `/catalog/…`, `/pricelist/…` | **без змін** | Як є | Ще дають трафік; без маппінгу не чіпаємо |

Після `certbot` зазвичай з’являється окремий `server { listen 443 ssl; server_name www.suprex.dental; ... }`. Скопіюйте в нього **ті самі** блоки (рядок з `if ($args …)`, усі `location ~*` для SEO та **перед** `location /`) — інакше на HTTPS правила не спрацюють.

Перевірка та перезавантаження:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Перевірки вручну (очікування в дужках):

- `curl -sI 'https://www.suprex.dental/shop?per_page=9'` → **301**, `Location` без `per_page`
- `curl -sI 'https://www.suprex.dental/any?utm_source=x&per_page=9'` → **301**, у `Location` лишається `utm_source`
- `curl -sI 'https://www.suprex.dental/portfolio/'` → **410**
- `curl -sI 'https://www.suprex.dental/about-us-3/'` → **301** на `/about`

## 9. Обновление с устаревшего nginx-конфига (релиз web + шаблон)

Если CRM когда-то ставили по примеру из README с `Connection 'upgrade'` на `location /`:

1. Обновите образ **web** (в прокси `/api/*` больше не пересылаются `connection` / `upgrade` / `content-length` с клиента).
2. Синхронизируйте `/etc/nginx/sites-available/suprex.dental.conf` с `deploy/nginx/suprex.dental.conf` и удалите `Upgrade` / `Connection 'upgrade'` из прокси на CRM и store, если они там есть.
3. `sudo nginx -t && sudo systemctl reload nginx`.

Проверка (на сервере, подставьте свой домен CRM):

```bash
grep -n "Connection.*upgrade\|Upgrade" /etc/nginx/sites-enabled/suprex.dental.conf || echo "OK: no forced upgrade in enabled config"
```
