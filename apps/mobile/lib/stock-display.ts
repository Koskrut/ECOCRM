import { t } from "@/lib/i18n";
import type { StockBreakdown } from "@/lib/order-utils";

export function formatStockBreakdown(
  breakdown: StockBreakdown,
  labels: { onWarehouse: string; reserved: string },
): string {
  return `${labels.onWarehouse}: ${breakdown.qty} · ${labels.reserved}: ${breakdown.reserved}`;
}

export function formatCatalogStockLine(name: string, breakdown: StockBreakdown): string {
  return `${name}: ${breakdown.qty} (${t("catalog.reserved")} ${breakdown.reserved})`;
}

export function formatOrderStockMeta(breakdown: StockBreakdown): string {
  return formatStockBreakdown(breakdown, {
    onWarehouse: t("orderCreate.onWarehouse"),
    reserved: t("orderCreate.reserved"),
  });
}
