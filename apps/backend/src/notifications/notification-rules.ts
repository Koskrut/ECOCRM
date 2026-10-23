export const NOTIFICATION_RULES_KEY = "notification_rules";

export type SaleAssignedDeliveryFilter = "ALL" | "PICKUP";

export type NotificationRules = {
  saleAssigned: {
    enabled: boolean;
    deliveryMethods: SaleAssignedDeliveryFilter;
  };
};

export const DEFAULT_NOTIFICATION_RULES: NotificationRules = {
  saleAssigned: {
    enabled: true,
    deliveryMethods: "ALL",
  },
};

export function normalizeNotificationRules(raw: unknown): NotificationRules {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sale =
    obj.saleAssigned && typeof obj.saleAssigned === "object"
      ? (obj.saleAssigned as Record<string, unknown>)
      : {};
  const deliveryMethods =
    sale.deliveryMethods === "PICKUP" || sale.deliveryMethods === "ALL"
      ? sale.deliveryMethods
      : DEFAULT_NOTIFICATION_RULES.saleAssigned.deliveryMethods;
  return {
    saleAssigned: {
      enabled:
        typeof sale.enabled === "boolean"
          ? sale.enabled
          : DEFAULT_NOTIFICATION_RULES.saleAssigned.enabled,
      deliveryMethods,
    },
  };
}

export function saleAssignedDeliveryAllows(
  rules: NotificationRules,
  deliveryMethod: string | null | undefined,
): boolean {
  if (!rules.saleAssigned.enabled) return false;
  if (rules.saleAssigned.deliveryMethods === "ALL") return true;
  return deliveryMethod === "PICKUP";
}
