/** Ukrainian labels for workbook `attribute_code` keys (store-facing). */
export const PRODUCT_SPEC_LABELS_UK: Record<string, string> = {
  compatibility_raw: "Сумісність (код з назви)",
  compatibility: "Сумісність",
  implant_system: "Система імплантів",
  connection_type: "Тип з’єднання",
  platform: "Платформа",
  diameter: "Діаметр, мм",
  height: "Висота (AH), мм",
  gingival_height: "Гінгівальна висота (GH), мм",
  angle: "Кут, °",
  length: "Довжина, мм",
  material: "Матеріал",
  coating: "Покриття",
  color: "Колір",
  screw_included: "Гвинт у комплекті",
  screwdriver_type: "Тип викрутки / серія",
  packaging_qty: "Кількість у упаковці",
  sterile: "Стерильність",
  production_time: "Термін виробництва, днів",
  tray_type: "Тип ложки",
  restoration_type: "Тип реставрації",
  for_multi_unit: "Для мульти-юніта",
  position_shape: "Позиція / форма",
  length_variant: "Варіант довжини",
  profile_size: "Розмір / профіль",
};

/** Preferred display order; unknown keys are appended alphabetically. */
export const PRODUCT_SPEC_ORDER: string[] = [
  "compatibility_raw",
  "compatibility",
  "implant_system",
  "connection_type",
  "platform",
  "diameter",
  "height",
  "gingival_height",
  "angle",
  "length",
  "material",
  "coating",
  "color",
  "screw_included",
  "screwdriver_type",
  "packaging_qty",
  "sterile",
  "production_time",
  "tray_type",
  "restoration_type",
  "for_multi_unit",
  "position_shape",
  "length_variant",
  "profile_size",
];

export function orderedSpecEntries(spec: Record<string, unknown>): [string, unknown][] {
  const seen = new Set<string>();
  const out: [string, unknown][] = [];
  for (const k of PRODUCT_SPEC_ORDER) {
    if (Object.prototype.hasOwnProperty.call(spec, k)) {
      out.push([k, spec[k]]);
      seen.add(k);
    }
  }
  for (const k of Object.keys(spec).sort()) {
    if (!seen.has(k)) out.push([k, spec[k]]);
  }
  return out;
}

export function formatSpecValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Так" : "Ні";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
