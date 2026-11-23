import type { CatalogSystem } from "@/lib/categories";

const PHONE = "+380673597488";
const EMAIL = "info@suprex.dental";
const ADDRESS = "Дніпро, просп. Б. Хмельницкого 147";

function codeHint(system: CatalogSystem): string {
  const code = [...system.synonyms]
    .filter((synonym) => synonym.code.toLowerCase() !== synonym.label.toLowerCase())
    .sort((a, b) => a.code.length - b.code.length)[0];
  if (!code) return "";
  return `У картках каталогу короткий код ${code.code} означає ${code.label}.`;
}

/** Body copy for a system page. Facts already stated on the site, plus the system name. */
export function systemPageText(system: CatalogSystem): string {
  const delivery =
    "Доставка Новою Поштою по Україні. Оплата при отриманні або карткою.";
  const contacts = `Телефон ${PHONE}, пошта ${EMAIL}. Адреса: ${ADDRESS}.`;

  if (system.id === "00") {
    return [
      "SUPREX — виробник стоматологічних компонентів сумісності.",
      "Викрутки SUPREX призначені для роботи з титановими платформами, абатментами та іншими компонентами каталогу.",
      "Якщо потрібен підбір під конкретну систему, залиште запит на консультацію з підбору сумісності.",
      delivery,
      contacts,
    ].join(" ");
  }

  return [
    "SUPREX — виробник стоматологічних компонентів сумісності.",
    `Для системи ${system.name} у каталозі зібрано титанові платформи, абатменти та інші компоненти.`,
    codeHint(system),
    "Оберіть позицію нижче або залиште запит на консультацію з підбору сумісності: підкажемо, який компонент підходить до вашої роботи.",
    delivery,
    contacts,
  ]
    .filter(Boolean)
    .join(" ");
}

export function systemMetaDescription(system: CatalogSystem): string {
  if (system.id === "00") {
    return "Викрутки SUPREX для компонентів сумісності. Доставка Новою Поштою по Україні, оплата при отриманні або карткою, консультація з підбору.";
  }
  return `${system.name}: титанові платформи, абатменти та інші компоненти сумісності SUPREX. Доставка Новою Поштою по Україні, консультація з підбору.`;
}
