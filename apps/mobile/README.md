# CRM Manager — мобільний клієнт (Expo)

Застосунок для польових менеджерів: візити, клієнти, завдання, GPS-зміна, карта маршруту, паливо.

## MVP-екрани

| Вкладка | Функції |
|---------|---------|
| **Сьогодні** | Найближчий візит, прогрес дня, зміна, швидкі дії (дзвінок, навігатор) |
| **Карта** | План / факт візитів / GPS-трек (статична карта) |
| **Клієнти** | Пошук контактів, картка, дзвінок, навігатор, візити на сьогодні |
| **Завдання** | Сьогодні / прострочені / всі; виконати, перенести |
| **Ще** | Зміна, трек, паливо, вихід |

## Вимоги

- Node.js 20+
- `npx expo` або `npm run dev:mobile`
- Для **фонового GPS** — нативна збірка (EAS preview/production), не Expo Go

## API

```bash
# apps/mobile/.env
EXPO_PUBLIC_API_URL=https://api.suprex.dental
```

| Середовище | URL |
|------------|-----|
| Android Emulator | `http://10.0.2.2:3001` |
| Фізичний телефон (dev) | `http://<LAN-IP>:3001` |
| Production (VPS) | `https://api.<домен>` |

## Запуск (розробка)

```bash
npm run dev:mobile
# або
cd apps/mobile && npx expo start
```

## Push-сповіщення (Android)

Remote push працює лише в **EAS build** (не в Expo Go). Потрібні FCM V1 credentials:

1. Firebase Console → проєкт → додати Android-додаток з package `dental.suprex.crm.manager`
2. Завантажити service account key (FCM V1) в EAS:
   ```bash
   cd apps/mobile && npx eas credentials
   ```
   або Expo dashboard → Project → Credentials → Android → FCM V1
3. Перезібрати APK/AAB (`preview` / `production`)
4. На бекенді (опційно): `EXPO_ACCESS_TOKEN` для Expo Push API у production

Після логіну застосунок реєструє Expo Push Token на `POST /notifications/push-devices`. Канал **Мобільний push** увімкнюється в веб-налаштуваннях сповіщень (`/settings/notifications`).

## Збірка APK (production / preview)

```bash
cd apps/mobile
EAS_NO_VCS=1 EAS_PROJECT_ROOT=$(pwd) npx eas-cli build --profile preview --platform android --non-interactive
```

Профіль `preview` у [`eas.json`](./eas.json) вже містить `EXPO_PUBLIC_API_URL` для Suprex.

## Release checklist (перед EAS build)

1. Перевірити залежності: `cd apps/mobile && npx expo install --check`
2. Smoke test bundling: `npx tsc --noEmit` (у `apps/mobile`). Повний `expo export` у monorepo може вимагати EAS; основний smoke — cloud build нижче.
3. Збірка APK з локальними змінами (обов'язково `EAS_NO_VCS=1`):

```bash
cd apps/mobile
EAS_NO_VCS=1 EAS_PROJECT_ROOT=$(pwd) npx eas-cli build --profile preview --platform android --non-interactive
```

4. На пристрої перевірити:
   - cold start (залогінений і без логіну) × 5
   - вкладка «Карта» (статична карта за замовчуванням)
   - створення замовлення з позиціями
   - старт/завершення зміни (якщо увімкнено `ext.visits`)
   - **push**: логін → увімкнути «Мобільний push» у веб-налаштуваннях → тригер події (наприклад нова задача) → сповіщення на телефоні → tap відкриває відповідний екран

**Не змінювати без native rebuild:** `babel.config.js` (Reanimated plugin), `newArchEnabled: true` в `app.json`.

## Модуль CRM

Увімкніть **`ext.visits`** на сервері — інакше візити, зміна, карта та паливо приховані (клієнти та завдання працюють через core CRM).

## Чеклист приймання MVP

- [ ] Вхід, сьогодні: список візитів, hero найближчого, прогрес
- [ ] Дзвінок і навігатор з візиту та картки клієнта
- [ ] Пошук клієнтів, картка контакту
- [ ] Завдання: фільтри, виконати, перенести
- [ ] Старт/завершення візиту з GPS
- [ ] Фоновий трек під час зміни (dev/preview build)
- [ ] Паливо: день, профіль авто

## Документація

- [mobile-manager-app](../../docs/mobile-manager-app/README.md)
