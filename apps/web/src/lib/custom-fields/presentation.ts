export const CUSTOM_FIELD_ENTITY_LABELS: Record<string, string> = {
  CONTACT: "Контакт",
  COMPANY: "Компанія",
  LEAD: "Лід",
  ORDER: "Замовлення",
  PRODUCT: "Товар",
  TASK: "Задача",
  ACTIVITY: "Активність",
};

export const CUSTOM_FIELD_TYPE_LABELS: Record<string, string> = {
  TEXT: "Текст",
  NUMBER: "Число",
  MONEY: "Гроші",
  BOOLEAN: "Так / ні",
  DATE: "Дата",
  SELECT: "Список",
  MULTISELECT: "Кілька зі списку",
  JSON: "Структуровані дані",
  USER: "Користувач",
  DICTIONARY_ITEM: "З довідника",
};

export function customFieldEntityLabel(entityType: string): string {
  return CUSTOM_FIELD_ENTITY_LABELS[entityType] ?? "Поле";
}

export function customFieldTypeLabel(type: string): string {
  return CUSTOM_FIELD_TYPE_LABELS[type] ?? "Поле";
}
