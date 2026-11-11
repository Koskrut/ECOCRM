/** System dictionary key for product characteristic codes / Ukrainian labels. */
export const PRODUCT_CHARACTERISTICS_DICTIONARY_KEY = "product.characteristics";

export const PRODUCT_CHARACTERISTICS_DICTIONARY_NAME = "Характеристики товару";

export const PRODUCT_CHARACTERISTICS_DICTIONARY_DESCRIPTION =
  "Коди та підписи властивостей товару (каталог, вітрина). Керується в Налаштування → Довідники.";

/** Internal workbook keys — kept in the dictionary but not offered as “add” in catalog UI. */
export const PRODUCT_CHARACTERISTICS_INTERNAL_KEYS = [
  "source_fragment",
  "fill_status",
  "review_note",
] as const;

/**
 * Default seed: attribute_code → Ukrainian label (aligned with catalog workbook).
 * Existing DB labels are not overwritten on ensure.
 */
export const PRODUCT_CHARACTERISTICS_SEED: ReadonlyArray<{
  key: string;
  label: string;
  sortOrder: number;
  internal?: boolean;
}> = [
  { key: "category_name", label: "Категорія", sortOrder: 10 },
  { key: "subcategory_name", label: "Підкатегорія", sortOrder: 20 },
  { key: "compatibility_raw", label: "Сумісність", sortOrder: 30 },
  { key: "compatibility", label: "Сумісність", sortOrder: 40 },
  { key: "implant_system", label: "Система імплантів", sortOrder: 50 },
  { key: "connection_type", label: "Тип з’єднання", sortOrder: 60 },
  { key: "platform", label: "Платформа", sortOrder: 70 },
  { key: "diameter", label: "Діаметр, мм", sortOrder: 80 },
  { key: "height", label: "Висота (AH), мм", sortOrder: 90 },
  { key: "gingival_height", label: "Гінгівальна висота (GH), мм", sortOrder: 100 },
  { key: "angle", label: "Кут, °", sortOrder: 110 },
  { key: "length", label: "Довжина, мм", sortOrder: 120 },
  { key: "material", label: "Матеріал", sortOrder: 130 },
  { key: "coating", label: "Покриття", sortOrder: 140 },
  { key: "color", label: "Колір", sortOrder: 150 },
  { key: "screw_included", label: "Гвинт у комплекті", sortOrder: 160 },
  { key: "screwdriver_type", label: "Тип викрутки / серія", sortOrder: 170 },
  { key: "packaging_qty", label: "Кількість у упаковці", sortOrder: 180 },
  { key: "sterile", label: "Стерильність", sortOrder: 190 },
  { key: "production_time", label: "Термін виробництва, днів", sortOrder: 200 },
  { key: "tray_type", label: "Тип ложки", sortOrder: 210 },
  { key: "restoration_type", label: "Тип реставрації", sortOrder: 220 },
  { key: "for_multi_unit", label: "Для мульти-юніта", sortOrder: 230 },
  { key: "position_shape", label: "Позиція / форма", sortOrder: 240 },
  { key: "length_variant", label: "Варіант довжини", sortOrder: 250 },
  { key: "profile_size", label: "Розмір / профіль", sortOrder: 260 },
  { key: "source_fragment", label: "Фрагмент джерела", sortOrder: 900, internal: true },
  { key: "fill_status", label: "Статус заповнення", sortOrder: 910, internal: true },
  { key: "review_note", label: "Примітка для перевірки", sortOrder: 920, internal: true },
];
