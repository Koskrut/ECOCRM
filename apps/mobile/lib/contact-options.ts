import { clientStageLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import type { ContactClientStage } from "@/types/crm";

export type SelectOption = { value: string; label: string };

export const CONTACT_REGION_OPTIONS: SelectOption[] = [
  { value: "", label: "—" },
  { value: "Вінницька", label: "Вінницька" },
  { value: "Волинська", label: "Волинська" },
  { value: "Дніпропетровська", label: "Дніпропетровська" },
  { value: "Донецька", label: "Донецька" },
  { value: "Житомирська", label: "Житомирська" },
  { value: "Закарпатська", label: "Закарпатська" },
  { value: "Запорізька", label: "Запорізька" },
  { value: "Івано-Франківська", label: "Івано-Франківська" },
  { value: "Київська", label: "Київська" },
  { value: "Кіровоградська", label: "Кіровоградська" },
  { value: "Луганська", label: "Луганська" },
  { value: "Львівська", label: "Львівська" },
  { value: "Миколаївська", label: "Миколаївська" },
  { value: "Одеська", label: "Одеська" },
  { value: "Полтавська", label: "Полтавська" },
  { value: "Рівненська", label: "Рівненська" },
  { value: "Сумська", label: "Сумська" },
  { value: "Тернопільська", label: "Тернопільська" },
  { value: "Харківська", label: "Харківська" },
  { value: "Херсонська", label: "Херсонська" },
  { value: "Хмельницька", label: "Хмельницька" },
  { value: "Черкаська", label: "Черкаська" },
  { value: "Чернівецька", label: "Чернівецька" },
  { value: "Чернігівська", label: "Чернігівська" },
];

export const CONTACT_CLIENT_TYPE_OPTIONS: SelectOption[] = [
  { value: "", label: "—" },
  { value: "Врач", label: "Врач" },
  { value: "Техник", label: "Техник" },
];

export const CONTACT_STATUS_OPTIONS: SelectOption[] = [
  { value: "", label: "—" },
  { value: "Клієнт", label: "Клієнт" },
  { value: "Зацікавленний", label: "Зацікавленний" },
  { value: "Тимчасово не працює", label: "Тимчасово не працює" },
  { value: "Відмова", label: "Відмова" },
  { value: "Немає зв'язку", label: "Немає зв'язку" },
  { value: "Видалити", label: "Видалити" },
  { value: "Не працює з імплантами", label: "Не працює з імплантами" },
];

export const CONTACT_CLIENT_STAGES: ContactClientStage[] = [
  "NEW_LEAD",
  "IN_PROGRESS",
  "WAITING_DECISION",
  "ACTIVE_CLIENT",
  "DORMANT_CLIENT",
  "AT_RISK",
  "PROBLEM_DEBT",
  "LOST_CLIENT",
];

export function contactStageOptions(): SelectOption[] {
  return [
    { value: "", label: "—" },
    ...CONTACT_CLIENT_STAGES.map((value) => ({
      value,
      label: clientStageLabel(value) || value,
    })),
  ];
}

export const CONTACT_NEXT_ACTION_TYPES = [
  "CALL",
  "MESSAGE",
  "SEND_OFFER",
  "CONTROL_PAYMENT",
  "MEETING",
  "NO_ACTION",
] as const;

export type ContactNextActionType = (typeof CONTACT_NEXT_ACTION_TYPES)[number];

export function contactNextActionOptions(): SelectOption[] {
  return [
    { value: "", label: t("contacts.nextAction.none") },
    ...CONTACT_NEXT_ACTION_TYPES.map((value) => ({
      value,
      label: t(`contacts.nextAction.${value}`),
    })),
  ];
}
