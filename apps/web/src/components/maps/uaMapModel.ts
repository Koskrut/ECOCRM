/** ISO 3166-2 → назва регіону в Bitrix / GET /analytics/map (поле `region`). */
export const ANALYTICS_REGION_BY_ISO: Record<string, string> = {
  "UA-05": "Вінницька",
  "UA-07": "Волинська",
  "UA-09": "Луганська",
  "UA-12": "Дніпропетровська",
  "UA-14": "Донецька",
  "UA-18": "Житомирська",
  "UA-21": "Закарпатська",
  "UA-23": "Запорізька",
  "UA-26": "Івано-Франківська",
  "UA-32": "Київська",
  "UA-35": "Кіровоградська",
  "UA-46": "Львівська",
  "UA-48": "Миколаївська",
  "UA-51": "Одеська",
  "UA-53": "Полтавська",
  "UA-56": "Рівненська",
  "UA-59": "Сумська",
  "UA-61": "Тернопільська",
  "UA-63": "Харківська",
  "UA-65": "Херсонська",
  "UA-68": "Хмельницька",
  "UA-71": "Черкаська",
  "UA-74": "Чернігівська",
  "UA-77": "Чернівецька",
};

/** Підписи на карті (українською). */
export const OBLAST_LABEL_UK: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(ANALYTICS_REGION_BY_ISO).map(([iso, r]) => [iso, `${r} область`]),
  ),
  "UA-30": "м. Київ",
  "UA-43": "Автономна Республіка Крим",
  "UA-40": "Севастополь",
};

const WEST_OBLAST_ISO = [
  "UA-05",
  "UA-07",
  "UA-56",
  "UA-18",
  "UA-46",
  "UA-26",
  "UA-21",
  "UA-61",
  "UA-77",
  "UA-68",
] as const;

const ALL_MAP_ISO = [
  "UA-05",
  "UA-07",
  "UA-09",
  "UA-12",
  "UA-14",
  "UA-18",
  "UA-21",
  "UA-23",
  "UA-26",
  "UA-30",
  "UA-32",
  "UA-35",
  "UA-40",
  "UA-43",
  "UA-46",
  "UA-48",
  "UA-51",
  "UA-53",
  "UA-56",
  "UA-59",
  "UA-61",
  "UA-63",
  "UA-65",
  "UA-68",
  "UA-71",
  "UA-74",
  "UA-77",
] as const;

const westSet = new Set<string>(WEST_OBLAST_ISO);
const EAST_OBLAST_ISO = ALL_MAP_ISO.filter((iso) => !westSet.has(iso));

export type SalesDepartmentId = "west" | "east";

export type SalesDepartment = {
  id: SalesDepartmentId;
  label: string;
  color: string;
  oblastIso: readonly string[];
};

/** Два відділи продажів: розподіл областей за карткою структури (можна замінити на дані з API). */
export const SALES_DEPARTMENTS: readonly SalesDepartment[] = [
  {
    id: "west",
    label: "Відділ «Захід»",
    color: "#4f46e5",
    oblastIso: WEST_OBLAST_ISO,
  },
  {
    id: "east",
    label: "Відділ «Схід та Південь»",
    color: "#0d9488",
    oblastIso: EAST_OBLAST_ISO,
  },
];

export function departmentForIso(iso: string): SalesDepartment | null {
  for (const d of SALES_DEPARTMENTS) {
    if ((d.oblastIso as readonly string[]).includes(iso)) return d;
  }
  return null;
}

export function departmentById(id: SalesDepartmentId): SalesDepartment | undefined {
  return SALES_DEPARTMENTS.find((d) => d.id === id);
}
