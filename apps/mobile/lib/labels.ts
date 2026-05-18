export function gpsVerificationLabel(code: string | null | undefined): string {
  switch (code) {
    case "VERIFIED":
      return "Вы на месте";
    case "NEARBY_WARNING":
      return "Рядом с точкой (подойдите ближе)";
    case "OUTSIDE_RADIUS":
      return "Далеко от плановой точки";
    case "MANUAL_REVIEW":
      return "Нужна ручная проверка (нет координат визита)";
    case "NO_FIX":
      return "Нет координат или слабый GPS";
    default:
      return code ? code : "";
  }
}

export const VISIT_OUTCOMES = [
  "SUCCESS",
  "FOLLOW_UP",
  "NO_DECISION",
  "NOT_RELEVANT",
  "FAILED",
] as const;

export type VisitOutcome = (typeof VISIT_OUTCOMES)[number];

export function visitOutcomeLabel(o: VisitOutcome): string {
  const map: Record<VisitOutcome, string> = {
    SUCCESS: "Успешно",
    FOLLOW_UP: "Повторный контакт",
    NO_DECISION: "Без решения",
    NOT_RELEVANT: "Не релевантно",
    FAILED: "Неуспешно",
  };
  return map[o] ?? o;
}
