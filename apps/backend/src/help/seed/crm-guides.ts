import type { HelpSeedArticle, HelpSeedCategory } from "./seed-types";
import { MANAGER_PLAYBOOK_ARTICLES } from "./manager-playbook-articles";
import { REWRITTEN_OVERVIEW_BY_KEY } from "./rewritten-overview-articles";

export type { HelpSeedArticle, HelpSeedCategory } from "./seed-types";
export { HELP_SEED_REVISION } from "./seed-types";

export const HELP_SEED_CATEGORIES: HelpSeedCategory[] = [
  { key: "crm-start", title: "Старт у CRM", audience: "PRODUCT", sortOrder: 10, icon: "LayoutDashboard" },
  {
    key: "crm-manager-playbooks",
    title: "Сценарії для менеджера",
    audience: "PRODUCT",
    sortOrder: 15,
    icon: "BookMarked",
  },
  { key: "crm-leads", title: "Ліди", audience: "PRODUCT", sortOrder: 20, icon: "UserPlus" },
  { key: "crm-orders", title: "Замовлення", audience: "PRODUCT", sortOrder: 30, icon: "Package" },
  { key: "crm-companies", title: "Компанії та контакти", audience: "PRODUCT", sortOrder: 40, icon: "Building2" },
  { key: "crm-tasks", title: "Завдання та денний план", audience: "PRODUCT", sortOrder: 50, icon: "ListTodo" },
  { key: "crm-comms", title: "Комунікації", audience: "PRODUCT", sortOrder: 60, icon: "MessageCircle" },
  { key: "crm-field", title: "Візити та склад", audience: "PRODUCT", sortOrder: 70, icon: "MapPin" },
  { key: "crm-finance", title: "Фінанси", audience: "PRODUCT", sortOrder: 80, icon: "Wallet" },
  { key: "crm-settings", title: "Налаштування", audience: "PRODUCT", sortOrder: 90, icon: "Settings" },
  { key: "crm-analytics", title: "Аналітика", audience: "PRODUCT", sortOrder: 100, icon: "BarChart3" },
  { key: "biz-sales", title: "Продажі", audience: "BUSINESS", sortOrder: 110, icon: "TrendingUp" },
  { key: "biz-service", title: "Сервіс", audience: "BUSINESS", sortOrder: 120, icon: "Headphones" },
  { key: "biz-warehouse", title: "Склад", audience: "BUSINESS", sortOrder: 130, icon: "Boxes" },
  { key: "biz-finance", title: "Фінанси компанії", audience: "BUSINESS", sortOrder: 140, icon: "Receipt" },
];

const BASE_HELP_SEED_ARTICLES: HelpSeedArticle[] = [
  {
    seedKey: "crm-start-navigation",
    categoryKey: "crm-start",
    slug: "crm-start-navigation",
    title: "Навігація та ролі",
    excerpt: "Як орієнтуватися в CRM і що доступно вашій ролі.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "dashboard" }],
    bodyMd: `# Навігація та ролі

## Бічне меню

Основні розділи CRM — у лівому меню: ліди, замовлення, компанії, контакти, завдання, каталог та інші модулі залежно від ліцензії.

## Ролі

- **ADMIN** — повний доступ, налаштування, аналітика, мониторинг.
- **LEAD** — керування командою, аналітика, фінанси (читання).
- **MANAGER** — щоденна робота з лідами, замовленнями, контактами.
- **WAREHOUSE** — склад, замовлення, каталог.

Якщо розділ не видно — перевірте роль або стан модулів у **Налаштування → Health**.

## Центр інструкцій

Розділ **Інструкції** містить гайди по CRM та внутрішні регламенти компанії. На багатьох екранах є іконка **?** зі статтями для поточного розділу.`,
  },
  {
    seedKey: "crm-start-first-steps",
    categoryKey: "crm-start",
    slug: "crm-start-first-steps",
    title: "Перші кроки після входу",
    excerpt: "Health, користувачі, імпорт — мінімальний чеклист запуску.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "settings.health" }, { routeKey: "settings" }],
    bodyMd: `# Перші кроки після входу

## 1. Перевірте Health

Відкрийте **Налаштування → Health**: версія, ліцензія, активні модулі.

## 2. Користувачі та доступ

**Налаштування → Доступ** — додайте колег, призначте ролі.

## 3. Імпорт даних

Якщо переходите з іншої системи — **Налаштування → Імпорт даних**: завантаження → перевірка → commit.

## 4. Metadata (за потреби)

Кастомні поля, словники та layouts — **Налаштування → Metadata**.`,
  },
  {
    seedKey: "crm-leads-create",
    categoryKey: "crm-leads",
    slug: "crm-leads-create",
    title: "Створення та кваліфікація ліда",
    excerpt: "Новий лід, контакт, джерело та перший дотик.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "leads" }, { entityType: "LEAD" }],
    bodyMd: `# Створення та кваліфікація ліда

## Створення

На сторінці **Ліди** натисніть **Створити**. Заповніть ім'я, телефон, джерело та канал.

## Кваліфікація

Переведіть лід у статус **В роботі** після першого контакту. Додайте нотатку або задачу з наступним кроком.

## Конвертація

Коли лід готовий до угоди — конвертуйте в **замовлення** з картки ліда.`,
  },
  {
    seedKey: "crm-leads-pipeline",
    categoryKey: "crm-leads",
    slug: "crm-leads-pipeline",
    title: "Воронка лідів",
    excerpt: "Статуси, увага та фільтри активних лідів.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "leads" }],
    bodyMd: `# Воронка лідів

## Статуси

- **Новий** — ще не оброблений.
- **В роботі** — менеджер веде діалог.
- **Успішний / Програний / Нецільовий / Спам** — фінальні стани.

## Увага

Використовуйте пресети «без дотику», «нові без контакту», «завислі в роботі» для пріоритизації.

## Налаштування воронки

Етапи та правила — **Налаштування → Воронка лідів**.`,
  },
  {
    seedKey: "crm-orders-stages",
    categoryKey: "crm-orders",
    slug: "crm-orders-stages",
    title: "Етапи замовлення",
    excerpt: "Воронка замовлень, зміна етапу, історія.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "orders" }, { entityType: "ORDER" }],
    bodyMd: `# Етапи замовлення

## Картка замовлення

Відкрийте замовлення зі списку. Етап змінюється на stepper або в блоці статусу.

## Історія

Перегляньте зміни етапів у стрічці активності замовлення.

## Воронка

Налаштування етапів — **Налаштування → Воронка замовлень**.`,
  },
  {
    seedKey: "crm-orders-catalog",
    categoryKey: "crm-orders",
    slug: "crm-orders-catalog",
    title: "Позиції та каталог",
    excerpt: "Додавання товарів у замовлення та знижки.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "orders" }, { routeKey: "catalog" }],
    bodyMd: `# Позиції та каталог

## Каталог

Розділ **Каталог** — пошук SKU, залишки, ціни.

## Позиції в замовленні

У картці замовлення додайте рядки з каталогу. Знижки на рядок або на замовлення — за політикою компанії (див. бізнес-регламенти).

## Знижки в системі

Глобальні правила — **Налаштування → Знижки на замовлення**.`,
  },
  {
    seedKey: "crm-companies-contacts",
    categoryKey: "crm-companies",
    slug: "crm-companies-contacts",
    title: "Компанії та контакти",
    excerpt: "Структура клієнта: компанія, контакт, адреси.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "companies" }, { routeKey: "contacts" }, { entityType: "COMPANY" }],
    bodyMd: `# Компанії та контакти

## Компанія

Юридична або торговельна одиниця клієнта. Містить реквізити, адреси, відповідального менеджера.

## Контакт

Особа з телефонами та email. Контакт може бути прив'язаний до компанії.

## Зв'язок з лідами та замовленнями

Ліди та замовлення посилаються на контакт і/або компанію — підтримуйте актуальні дані для дзвінків і доставки.`,
  },
  {
    seedKey: "crm-companies-dedup",
    categoryKey: "crm-companies",
    slug: "crm-companies-dedup",
    title: "Дублікати та якість даних",
    excerpt: "Як уникати дублів контактів і компаній.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "companies" }, { routeKey: "contacts" }],
    bodyMd: `# Дублікати та якість даних

## Перед створенням

Шукайте існуючий контакт за телефоном або email.

## Телефон

Система нормалізує номери — вводьте в єдиному форматі.

## Відповідальний

Призначте owner на компанії та контакті для прозорої роботи менеджерів.`,
  },
  {
    seedKey: "crm-tasks-daily",
    categoryKey: "crm-tasks",
    slug: "crm-tasks-daily",
    title: "Завдання та денний план",
    excerpt: "Tasks, agenda та day plan для менеджера.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "tasks" }, { routeKey: "work.daily-agenda" }],
    bodyMd: `# Завдання та денний план

## Завдання

Розділ **Завдання** — список задач з дедлайнами. Створюйте задачі з карток лідів, контактів, замовлень.

## Денна agenda

**Робота → Денна agenda** — пропозиції на день на основі лідів, задач і дзвінків.

## Day plan

Персональний план дня — налаштовується в **Налаштування → Day plan**.`,
  },
  {
    seedKey: "crm-tasks-overdue",
    categoryKey: "crm-tasks",
    slug: "crm-tasks-overdue",
    title: "Прострочені завдання",
    excerpt: "Контроль SLA та прострочень у аналітиці.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "tasks" }, { routeKey: "analytics" }],
    bodyMd: `# Прострочені завдання

## Контроль

Переглядайте прострочені задачі у списку з фільтром або в **Аналітиці → Завдання**.

## На лідах

Прострочена задача на ліді — сигнал «завислого» ліда. Оновіть статус або перенесіть дедлайн з коментарем.`,
  },
  {
    seedKey: "crm-comms-calls",
    categoryKey: "crm-comms",
    slug: "crm-comms-calls",
    title: "Прозвін та історія дзвінків",
    excerpt: "Manual calling, записи, Kyivstar FMC.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "work.calls" }, { routeKey: "work.calls.history" }],
    bodyMd: `# Прозвін та історія дзвінків

## Черга прозвону

**Робота → Прозвін** — список контактів для дзвінка згідно з правилами черги.

## Історія

**Історія дзвінків** — журнал з прив'язкою до контактів і лідів.

## Інтеграції

Ringostat / Kyivstar FMC — налаштування в **Налаштування → Інтеграції**.`,
  },
  {
    seedKey: "crm-comms-inbox",
    categoryKey: "crm-comms",
    slug: "crm-comms-inbox",
    title: "Inbox: Telegram, Instagram, Facebook",
    excerpt: "Вхідні повідомлення та прив'язка до CRM.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "inbox.telegram" }, { routeKey: "inbox.instagram" }],
    bodyMd: `# Inbox

## Telegram / Meta

Вхідні чати в окремих розділах меню. Непрочитані позначені badge.

## Прив'язка

Пов'яжіть чат з **контактом** або **лідом**, щоб зберегти історію в CRM.

## Налаштування

Підключення — **Налаштування → Telegram** та **Meta Messaging**.`,
  },
  {
    seedKey: "crm-field-visits",
    categoryKey: "crm-field",
    slug: "crm-field-visits",
    title: "Візити в поле",
    excerpt: "План візитів, GPS, завершення візиту.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "visits" }, { entityType: "VISIT" }],
    bodyMd: `# Візити в поле

## План

**Візити** — маршрут і список точок на день.

## Старт і завершення

Фіксуйте початок і завершення візиту в мобільному або веб-інтерфейсі (залежно від процесу компанії).

## Історія

**Історія візитів** — архів для аналітики та контролю.`,
  },
  {
    seedKey: "crm-field-warehouse",
    categoryKey: "crm-field",
    slug: "crm-field-warehouse",
    title: "Робота складу",
    excerpt: "Роль WAREHOUSE: замовлення та каталог.",
    status: "PUBLISHED",
    sortOrder: 20,
    visibleRoles: ["WAREHOUSE", "ADMIN", "LEAD"],
    bindings: [{ routeKey: "work.warehouse" }, { routeKey: "catalog" }],
    bodyMd: `# Робота складу

## Доступ

Роль **WAREHOUSE** бачить **Склад**, **Замовлення** та **Каталог**.

## Замовлення

Обробляйте замовлення згідно з внутрішнім регламентом компанії (розділ **Бізнес → Склад**).

## Каталог

Перевіряйте залишки та артикули перед відвантаженням.`,
  },
  {
    seedKey: "crm-finance-payments",
    categoryKey: "crm-finance",
    slug: "crm-finance-payments",
    title: "Оплати та розподіл",
    excerpt: "Платежі, unmatched, публічні посилання на оплату.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "payments" }],
    bodyMd: `# Оплати

## Список оплат

**Оплати** — вхідні платежі з банку або ручні.

## Unmatched

Нерозподілені платежі потребують прив'язки до замовлення або контрагента.

## Інтеграції

Privat24, UPC, банк — **Налаштування → Інтеграції**.`,
  },
  {
    seedKey: "crm-finance-receivables",
    categoryKey: "crm-finance",
    slug: "crm-finance-receivables",
    title: "Дебіторка",
    excerpt: "Контроль заборгованості клієнтів.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "receivables" }],
    bodyMd: `# Дебіторка

## Огляд

**Дебіторка** — баланси клієнтів, прострочення, черга уваги.

## Робота з боргом

Фіксуйте домовленості в задачах і нотатках на компанії/контакті.

## Звіти

Детальніша аналітика — **Аналітика → Фінанси**.`,
  },
  {
    seedKey: "crm-settings-import",
    categoryKey: "crm-settings",
    slug: "crm-settings-import",
    title: "Імпорт даних",
    excerpt: "Upload → validate → commit для масового onboarding.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "settings.data-import" }],
    bodyMd: `# Імпорт даних

## Процес

1. Завантажте файл (CSV/XLSX згідно з шаблоном).
2. **Validate** — перевірка помилок.
3. **Commit** — запис у базу.

## Jobs

Список jobs показує статус і помилки рядків.

## Після імпорту

Перевірте Health та вибірково картки контактів/компаній.`,
  },
  {
    seedKey: "crm-settings-metadata",
    categoryKey: "crm-settings",
    slug: "crm-settings-metadata",
    title: "Metadata: поля, словники, layouts",
    excerpt: "Кастомізація CRM без розробки.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "settings.metadata" }, { routeKey: "settings" }],
    bodyMd: `# Metadata

## Custom fields

Додайте поля до LEAD, ORDER, CONTACT тощо.

## Dictionaries

Довідники для select-полів (канали, регіони, причини).

## Layouts

Картки та таблиці — які поля показувати в UI.

## Workflows

Автоматизації на події (нотифікації, задачі).`,
  },
  {
    seedKey: "crm-analytics-overview",
    categoryKey: "crm-analytics",
    slug: "crm-analytics-overview",
    title: "Огляд аналітики",
    excerpt: "Дашборди, період, фільтр менеджера.",
    status: "PUBLISHED",
    sortOrder: 10,
    bindings: [{ routeKey: "analytics" }],
    bodyMd: `# Огляд аналітики

## Доступ

Розділ **Аналітика** — для ролей **ADMIN** та **LEAD**.

## Вкладки

Продажі, ліди, клієнти, продукти, фінанси, операції, візити, менеджери, карта, увага.

## Фільтри

Оберіть період і менеджера для порівняння KPI.`,
  },
  {
    seedKey: "crm-analytics-attention",
    categoryKey: "crm-analytics",
    slug: "crm-analytics-attention",
    title: "Розділ «Увага»",
    excerpt: "Anomaly queues: що потребує реакції зараз.",
    status: "PUBLISHED",
    sortOrder: 20,
    bindings: [{ routeKey: "analytics.attention" }],
    bodyMd: `# Розділ «Увага»

## Призначення

Зведення сигналів: прострочені задачі, «завислі» ліди, фінансові аномалії.

## Дії

Переходьте з черги безпосередньо в картку сутності та фіксуйте результат у CRM.`,
  },
];

function withSeedRevision(article: HelpSeedArticle): HelpSeedArticle {
  return REWRITTEN_OVERVIEW_BY_KEY.get(article.seedKey) ?? {
    ...article,
    seedRevision: article.seedRevision ?? 1,
  };
}

export const HELP_SEED_ARTICLES: HelpSeedArticle[] = [
  ...BASE_HELP_SEED_ARTICLES.map(withSeedRevision),
  ...MANAGER_PLAYBOOK_ARTICLES,
];

export function getSeedArticleByKey(seedKey: string): HelpSeedArticle | undefined {
  return HELP_SEED_ARTICLES.find((a) => a.seedKey === seedKey);
}
