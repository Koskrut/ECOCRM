import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { OrderListItem } from "@/lib/api/orders";
import { useTheme } from "@/lib/design/theme-context";
import { formatOrderAmount } from "@/lib/order-currency";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";

type Props = {
  item: OrderListItem;
  index?: number;
};

function formatAmount(o: OrderListItem): string {
  if (o.totalAmount == null) return "—";
  return formatOrderAmount(o.totalAmount, o.currency ?? "USD", o.exchangeRate);
}

function clientLabel(o: OrderListItem): string {
  if (o.client) return [o.client.firstName, o.client.lastName].filter(Boolean).join(" ");
  if (o.company?.name) return o.company.name;
  return "—";
}

function statusTone(stage?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  if (!stage) return "default";
  if (stage === "COMPLETED" || stage === "RECEIVED") return "success";
  if (stage === "CANCELED" || stage === "REFUSED") return "danger";
  if (stage === "AWAITING_PAYMENT" || stage === "AWAITING_STOCK") return "warning";
  return "info";
}

function hasTtn(o: OrderListItem): boolean {
  const np = o.deliveryData?.novaPoshta as Record<string, unknown> | undefined;
  const ttn = np?.ttn as Record<string, unknown> | undefined;
  return typeof ttn?.number === "string" && ttn.number.length > 0;
}

function formatOrderDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stockReadinessLabel(readiness: OrderListItem["stockReadiness"]): string | null {
  if (!readiness || readiness === "NONE") return null;
  if (readiness === "FULL") return t("orders.stockFull");
  if (readiness === "PARTIAL") return t("orders.stockPartial");
  return null;
}

function stockReadinessTone(readiness: OrderListItem["stockReadiness"]): "success" | "warning" {
  return readiness === "FULL" ? "success" : "warning";
}

export function OrderListRow({ item, index = 0 }: Props) {
  const router = useRouter();
  const theme = useTheme();
  const itemCount = item.items?.length ?? 0;
  const stockLabel =
    item.orderStage === "AWAITING_STOCK" ? stockReadinessLabel(item.stockReadiness) : null;

  return (
    <AnimatedListItem index={index}>
      <Card
        onPress={() => router.push(`/orders/${item.id}`)}
        variant="elevated"
        style={{ marginBottom: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={theme.typography.bodyMedium}>
              {item.orderNumber ? `#${item.orderNumber}` : t("orders.orderFallback")}
            </Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {clientLabel(item)}
            </Text>
          </View>
          <StatusPill
            label={orderStageLabel(item.orderStage) || item.status}
            tone={statusTone(item.orderStage)}
          />
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            marginTop: theme.spacing.sm,
          }}>
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
            {formatOrderDate(item.createdAt)}
          </Text>
          {itemCount > 0 ? (
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              · {t("orders.itemsCount", { count: itemCount })}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: theme.spacing.sm,
            gap: 8,
          }}>
          <Text style={theme.typography.bodyMedium}>{formatAmount(item)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
            {stockLabel ? (
              <StatusPill label={stockLabel} tone={stockReadinessTone(item.stockReadiness)} />
            ) : null}
            {hasTtn(item) ? <StatusPill label={t("orders.ttn")} tone="info" /> : null}
          </View>
        </View>
      </Card>
    </AnimatedListItem>
  );
}
