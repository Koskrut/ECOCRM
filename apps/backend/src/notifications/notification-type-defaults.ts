import type { NotificationType } from "@prisma/client";

export const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  "ORDER_QTY_CHANGED",
  "ORDER_SPLIT",
  "ORDER_STAGE_CHANGED",
  "MISSED_CALL",
  "NEW_LEAD",
  "TASK_ASSIGNED",
  "TELEGRAM_MESSAGE",
  "META_INSTAGRAM_MESSAGE",
  "META_FACEBOOK_MESSAGE",
  "FIELD_SHIFT_CLOSE_REMINDER",
  "FIELD_GPS_STALE",
  "PLANNING_FACTORY_DUE",
  "PLANNING_PACKING_DUE",
  "CLIENT_ORDER_ACCEPTED",
  "RISK_ALERT",
];

const DEFAULT_MOBILE_TYPES = new Set<NotificationType>([
  "FIELD_SHIFT_CLOSE_REMINDER",
  "FIELD_GPS_STALE",
  "PLANNING_FACTORY_DUE",
  "PLANNING_PACKING_DUE",
  "CLIENT_ORDER_ACCEPTED",
]);

/** Manager pocket alerts on the shared shop bot (opt-out via Settings → Notifications). */
const DEFAULT_TELEGRAM_TYPES = new Set<NotificationType>([
  "TELEGRAM_MESSAGE",
  "NEW_LEAD",
  "CLIENT_ORDER_ACCEPTED",
]);

export function defaultChannelsForType(type: NotificationType): {
  inApp: boolean;
  browser: boolean;
  telegram: boolean;
  mobile: boolean;
} {
  return {
    inApp: true,
    browser: false,
    telegram: DEFAULT_TELEGRAM_TYPES.has(type),
    mobile: DEFAULT_MOBILE_TYPES.has(type),
  };
}

export function isDefaultMobileType(type: NotificationType): boolean {
  return DEFAULT_MOBILE_TYPES.has(type);
}
