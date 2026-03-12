# Nginx + HTTPS для crm.suprex.dental и www.suprex.dental

## 1. DNS

У регистратора домена suprex.dental:
- **crm.suprex.dental** → A-запись на IP сервера
- **www.suprex.dental** → A-запись на IP сервера

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
sudo certbot --nginx -d crm.suprex.dental -d www.suprex.dental
```

Certbot сам добавит в конфиг блоки `listen 443 ssl` и пути к сертификатам. После этого перезагрузите nginx:

```bash
sudo systemctl reload nginx
```

## 5. .env на сервере

В `/opt/crm/.env` должна быть строка (уже есть в .env.production.example):

```
CORS_ORIGIN=https://crm.suprex.dental,https://www.suprex.dental
```

Перезапустите backend:

```bash
cd /opt/crm
docker compose -f docker-compose.prod.yml --env-file .env up -d backend
```

## 6. Проверка

- https://crm.suprex.dental — CRM, вход
- https://www.suprex.dental — магазин
