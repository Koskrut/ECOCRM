export type TtnUiStage = "draft" | "transit" | "at_branch" | "delivered" | "canceled" | "return";

export type TtnStatusPresentation = {
  stage: TtnUiStage;
  label: string;
  color: string;
  tooltip: string | null;
};

const STAGE_CONFIG: Record<TtnUiStage, { color: string; fallbackLabel: string }> = {
  draft: { color: "bg-blue-100 text-blue-800", fallbackLabel: "Створено" },
  transit: { color: "bg-sky-100 text-sky-800", fallbackLabel: "В дорозі" },
  at_branch: { color: "bg-amber-100 text-amber-800", fallbackLabel: "У відділенні" },
  delivered: { color: "bg-emerald-100 text-emerald-800", fallbackLabel: "Отримано" },
  canceled: { color: "bg-red-100 text-red-700", fallbackLabel: "Скасовано" },
  return: { color: "bg-orange-100 text-orange-800", fallbackLabel: "Повернення" },
};

export function resolveTtnUiStage(
  statusCode?: string | null,
  statusText?: string | null,
): TtnUiStage {
  const code = String(statusCode ?? "").trim();
  const text = String(statusText ?? "").toLowerCase();

  if (code === "2" || text.includes("видал") || text.includes("удален")) return "canceled";

  if (
    text.includes("повернен") ||
    text.includes("повернення") ||
    text.includes("возврат") ||
    text.includes("відмова") ||
    text.includes("отказ") ||
    text.includes("не вруч") ||
    text.includes("не вручен")
  ) {
    return "return";
  }

  if (["9", "10", "11"].includes(code) || text.includes("отрим") || text.includes("получено")) {
    return "delivered";
  }

  if (code === "5" || text.includes("відділен") || text.includes("поштомат")) {
    return "at_branch";
  }

  if (
    ["3", "4", "41", "5", "6", "7", "8", "101"].includes(code) ||
    text.includes("в дороз") ||
    text.includes("в пути") ||
    text.includes("прямує") ||
    text.includes("прибул") ||
    text.includes("прийнят") ||
    text.includes("принят")
  ) {
    return code === "5" ? "at_branch" : "transit";
  }

  if (code === "1" || text.includes("створив") || text.includes("создан")) return "draft";

  if (!code && !text.trim()) return "draft";

  return "transit";
}

export function getTtnStatusPresentation(
  statusCode?: string | null,
  statusText?: string | null,
): TtnStatusPresentation | null {
  const code = String(statusCode ?? "").trim();
  const text = String(statusText ?? "").trim();
  if (!code && !text) return null;

  const stage = resolveTtnUiStage(code || null, text || null);
  const config = STAGE_CONFIG[stage];
  const label = text || config.fallbackLabel;
  const tooltip =
    code && text && text !== config.fallbackLabel
      ? `${text} (код ${code})`
      : code
        ? `Код НП: ${code}`
        : text || null;

  return { stage, label, color: config.color, tooltip };
}
