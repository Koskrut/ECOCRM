import type {
  ContactClientStage,
  ContactExclusionCode,
  ContactNextActionType,
  ContactPriorityReasonCode,
} from "@/lib/api/resources/contacts";

const PRIORITY_REASON_LABELS: Record<ContactPriorityReasonCode, string> = {
  OVERDUE_FOLLOWUP: "Прострочений фоллоуап",
  NEW_LEAD_NO_FIRST_CONTACT: "Новий клієнт без першого контакту",
  NO_CONTACT_14_DAYS: "Не було контакту 14+ днів",
  NO_ORDER_30_DAYS: "Немає замовлень 30+ днів",
  HAS_DEBT: "Є заборгованість",
  HIGH_VALUE_CLIENT: "Цінний клієнт",
  RETURN_TO_WORK: "Повернути в роботу",
  AT_RISK: "Під ризиком втрати",
  DORMANT: "Сплячий клієнт",
};

const NEXT_ACTION_LABELS: Record<ContactNextActionType, string> = {
  CALL: "Дзвінок",
  MESSAGE: "Повідомлення",
  SEND_OFFER: "Надіслати пропозицію",
  CONTROL_PAYMENT: "Контроль оплати",
  MEETING: "Зустріч",
  NO_ACTION: "Без дії",
};

const CLIENT_STAGE_LABELS: Record<ContactClientStage, string> = {
  NEW_LEAD: "Новий лід",
  IN_PROGRESS: "В роботі",
  WAITING_DECISION: "Очікує рішення",
  ACTIVE_CLIENT: "Активний клієнт",
  DORMANT_CLIENT: "Сплячий клієнт",
  AT_RISK: "У зоні ризику",
  PROBLEM_DEBT: "Проблемна заборгованість",
  LOST_CLIENT: "Втрачений клієнт",
};

const EXCLUSION_LABELS: Record<ContactExclusionCode, string> = {
  DO_NOT_DISTURB: "Не турбувати",
  NON_TARGET_STATUS: "Нецільовий контакт",
  DUPLICATE_MARKED: "Позначено як дублікат",
};

const PRIORITY_REASON_COMPACT_LABELS: Record<ContactPriorityReasonCode, string> = {
  OVERDUE_FOLLOWUP: "Просрочен",
  NEW_LEAD_NO_FIRST_CONTACT: "Без 1-го контакта",
  NO_CONTACT_14_DAYS: "Нет контакта 14+",
  NO_ORDER_30_DAYS: "Нет заказа 30+",
  HAS_DEBT: "Долг",
  HIGH_VALUE_CLIENT: "VIP",
  RETURN_TO_WORK: "Вернуть",
  AT_RISK: "Риск",
  DORMANT: "Спящий",
};

export function formatContactPriorityReason(reason: ContactPriorityReasonCode): string {
  return PRIORITY_REASON_LABELS[reason] ?? reason;
}

export function formatContactPriorityReasonCompact(reason: ContactPriorityReasonCode): string {
  return PRIORITY_REASON_COMPACT_LABELS[reason] ?? formatContactPriorityReason(reason);
}

export function formatContactNextActionType(action: ContactNextActionType | null | undefined): string {
  if (!action) return "Без дії";
  return NEXT_ACTION_LABELS[action] ?? "Без дії";
}

export function formatContactClientStage(stage: ContactClientStage | null | undefined): string {
  if (!stage) return "Без ручної стадії";
  return CLIENT_STAGE_LABELS[stage] ?? "Без ручної стадії";
}

export function formatContactExclusionReason(reason: ContactExclusionCode): string {
  return EXCLUSION_LABELS[reason] ?? reason;
}
