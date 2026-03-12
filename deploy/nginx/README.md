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
