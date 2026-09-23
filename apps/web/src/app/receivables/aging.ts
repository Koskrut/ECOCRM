export type AgingChip = "" | "0-7" | "8-30" | "31-60" | "90+";

export function matchesAging(days: number | undefined, chip: AgingChip): boolean {
  if (!chip) return true;
  const d = Math.max(Number(days) || 0, 0);
  if (chip === "0-7") return d <= 7;
  if (chip === "8-30") return d >= 8 && d <= 30;
  if (chip === "31-60") return d >= 31 && d <= 60;
  return d > 60;
}
