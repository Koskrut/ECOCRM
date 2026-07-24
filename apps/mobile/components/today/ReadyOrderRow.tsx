import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { useTheme } from "@/lib/design/theme-context";
import type { OrderListItem } from "@/lib/api/orders";
import { formatOrderAmount } from "@/lib/order-currency";
import { t } from "@/lib/i18n";

type Props = {
  order: OrderListItem;
  index?: number;
};

function clientLabel(o: OrderListItem): string {
  if (o.client) return [o.client.firstName, o.client.lastName].filter(Boolean).join(" ");
  if (o.company?.name) return o.company.name;
  return "—";
}

function formatAmount(o: OrderListItem): string {
  if (o.totalAmount == null) return "—";
  return formatOrderAmount(o.totalAmount, o.currency ?? "USD", o.exchangeRate);
}

export function ReadyOrderRow({ order, index = 0 }: Props) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <AnimatedListItem index={index}>
      <Card
        onPress={() => router.push(`/orders/${order.id}`)}
        variant="elevated"
        style={{ marginBottom: theme.spacing.sm }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={[theme.typography.bodyMedium, { flex: 1 }]}>
            {order.orderNumber ? `#${order.orderNumber}` : t("orders.orderFallback")}
          </Text>
          <StatusPill label={t("today.stockReady")} tone="success" />
        </View>
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
          {clientLabel(order)}
        </Text>
        <Text style={[theme.typography.bodyMedium, { marginTop: 6 }]}>{formatAmount(order)}</Text>
      </Card>
    </AnimatedListItem>
  );
}
