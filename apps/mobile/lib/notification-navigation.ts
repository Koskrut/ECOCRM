import type { Router } from "expo-router";

export function notificationEntityPath(
  entityType: string | undefined,
  entityId: string | undefined,
): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "ORDER":
      return `/orders/${entityId}`;
    case "LEAD":
      return `/leads/${entityId}`;
    case "TASK":
      return `/tasks/${entityId}`;
    case "CONTACT":
      return `/contact/${entityId}`;
    case "VISIT":
      return `/visit/${entityId}`;
    case "FIELD_SHIFT":
      return "/(tabs)";
    default:
      return null;
  }
}

export function navigateFromNotificationData(
  router: Router,
  data: Record<string, unknown>,
): void {
  if (data.type === "gps_stopped" || data.screen === "today") {
    router.push("/(tabs)");
    return;
  }

  if (typeof data.visitId === "string" && data.visitId.length > 0) {
    router.push(`/visit/${data.visitId}`);
    return;
  }

  const entityType = typeof data.entityType === "string" ? data.entityType : undefined;
  const entityId = typeof data.entityId === "string" ? data.entityId : undefined;
  const path = notificationEntityPath(entityType, entityId);
  if (path) {
    router.push(path);
  }
}
