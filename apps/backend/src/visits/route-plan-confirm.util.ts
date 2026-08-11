export type RoutePlanConfirmBlockReason =
  | "no_plan"
  | "missing_coords"
  | "osrm_unavailable";

const CONFIRM_MESSAGES: Record<RoutePlanConfirmBlockReason, string> = {
  no_plan: "Спочатку збережіть маршрут",
  missing_coords: "Вкажіть координати для всіх візитів маршруту",
  osrm_unavailable:
    "Не можна утвердити приблизний маршрут — OSRM недоступний. Перевірте сервіс osrm / GET /system/routing-health.",
};

export function routePlanConfirmBlockReason(opts: {
  hasPlan: boolean;
  stopCount: number;
  missingCoordsCount: number;
  geometrySource: string | null | undefined;
}): RoutePlanConfirmBlockReason | null {
  if (!opts.hasPlan || opts.stopCount < 1) return "no_plan";
  if (opts.missingCoordsCount > 0) return "missing_coords";
  if (opts.geometrySource !== "osrm") return "osrm_unavailable";
  return null;
}

export function routePlanConfirmBlockMessage(
  reason: RoutePlanConfirmBlockReason | null,
): string | null {
  return reason ? CONFIRM_MESSAGES[reason] : null;
}

export const ROUTE_SESSION_START_REQUIRES_CONFIRM =
  "Спочатку збережіть і утвердіть маршрут";
