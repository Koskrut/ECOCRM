# Nginx + HTTPS для crm.suprex.dental, www.suprex.dental и api.suprex.dental

## 1. DNS

У регистратора домена suprex.dental:
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

## 4. Получить SSL-сертификаты

```bash
sudo certbot --nginx -d crm.suprex.dental -d www.suprex.dental -d api.suprex.dental
```

Certbot сам добавит в конфиг блоки `listen 443 ssl` и пути к сертификатам. После этого перезагрузите nginx:

```bash
sudo systemctl reload nginx
```

## 5. .env на сервере

В `/opt/crm/.env` должны быть строки (см. .env.production.example):

```
CORS_ORIGIN=https://crm.suprex.dental,https://www.suprex.dental
PUBLIC_BASE_URL=https://api.suprex.dental
```

Перезапустите backend:

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

- https://crm.suprex.dental — CRM, вход
- https://www.suprex.dental — магазин
- https://api.suprex.dental — бекенд (например, GET /health или любой публичный эндпоинт)

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
