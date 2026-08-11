import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Themed";
import { AnimatedListItem } from "@/components/ui/AnimatedListItem";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type {
  ContactOrderMovementChild,
  ContactOrderMovementNode,
  ContactOrdersMovementResponse,
} from "@/lib/api/contacts";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";
import { formatOrderAmount } from "@/lib/order-currency";

function paymentStatusLabel(status?: string | null): string {
  if (!status) return "";
  const map: Record<string, string> = {
    UNPAID: t("contacts.ordersMovement.paymentUnpaid"),
    PARTIALLY_PAID: t("contacts.ordersMovement.paymentPartial"),
    PAID: t("contacts.ordersMovement.paymentPaid"),
    OVERPAID: t("contacts.ordersMovement.paymentOverpaid"),
  };
  return map[status] ?? status;
}

function paymentStatusTone(status?: string | null): "default" | "success" | "warning" | "info" {
  if (status === "PAID") return "success";
  if (status === "PARTIALLY_PAID") return "warning";
  if (status === "OVERPAID") return "info";
  return "default";
}

function stageTone(stage?: string | null): "default" | "success" | "warning" | "danger" | "info" {
  if (!stage) return "default";
  if (stage === "COMPLETED" || stage === "RECEIVED") return "success";
  if (stage === "CANCELED" || stage === "REFUSED") return "danger";
  if (stage === "AWAITING_PAYMENT" || stage === "AWAITING_STOCK" || stage === "RETURN_IN_PROGRESS") {
    return "warning";
  }
  return "info";
}

function returnStatusLabel(status: string): string {
  const map: Record<string, string> = {
    REQUESTED: t("contacts.ordersMovement.statusRequested"),
    APPROVED: t("contacts.ordersMovement.statusApproved"),
    IN_TRANSIT_BACK: t("contacts.ordersMovement.statusInTransitBack"),
    RECEIVED_BY_WAREHOUSE: t("contacts.ordersMovement.statusReceivedByWarehouse"),
    INSPECTION: t("contacts.ordersMovement.statusInspection"),
    REFUND_OR_ADJUSTMENT: t("contacts.ordersMovement.statusRefundOrAdjustment"),
    CLOSED: t("contacts.ordersMovement.statusClosed"),
  };
  return map[status] ?? status;
}

function paymentSourceLabel(sourceType: string): string {
  const map: Record<string, string> = {
    BANK: t("contacts.ordersMovement.sourceBank"),
    CASH: t("contacts.ordersMovement.sourceCash"),
    CREDIT: t("contacts.ordersMovement.sourceCredit"),
    CREDIT_TRANSFER: t("contacts.ordersMovement.sourceCreditTransfer"),
  };
  return map[sourceType] ?? sourceType;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSignedAmount(amount: number, currency: string, exchangeRate?: number | null): string {
  const formatted = formatOrderAmount(Math.abs(amount), currency, exchangeRate);
  return amount < 0 ? `−${formatted}` : `+${formatted}`;
}

export function ContactOrdersMovement({
  data,
  error,
  onRetry,
}: {
  data: ContactOrdersMovementResponse | null;
  error?: boolean;
  onRetry?: () => void;
}) {
  const theme = useTheme();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  if (error) {
    return (
      <View>
        <Text style={[theme.typography.body, { color: theme.colors.dangerText }]}>
          {t("contacts.ordersMovement.loadError")}
        </Text>
        {onRetry ? (
          <Text
            onPress={onRetry}
            style={[theme.typography.bodyMedium, { color: theme.colors.primary, marginTop: 6 }]}
          >
            {t("common.retry")}
          </Text>
        ) : null}
      </View>
    );
  }

  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <Text style={[theme.typography.body, { color: theme.colors.textMuted }]}>{t("common.noData")}</Text>
    );
  }

  const toggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View>
      {items.map((order, index) => (
        <OrderMovementCard
          key={order.id}
          order={order}
          index={index}
          expanded={expandedIds.has(order.id)}
          onToggle={() => toggle(order.id)}
        />
      ))}
    </View>
  );
}

function OrderMovementCard({
  order,
  index,
  expanded,
  onToggle,
}: {
  order: ContactOrderMovementNode;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();
  const theme = useTheme();
  const openOrder = () => router.push(`/orders/${order.id}`);

  const chips: string[] = [];
  if (order.counts.openReturns > 0) chips.push(t("contacts.ordersMovement.openReturns"));
  if (order.counts.payments > 0) {
    chips.push(t("contacts.ordersMovement.paymentsChip", { count: order.counts.payments }));
  }
  if (order.counts.returns > 0) {
    chips.push(t("contacts.ordersMovement.returnsChip", { count: order.counts.returns }));
  }
  if (order.counts.children > 0) {
    chips.push(t("contacts.ordersMovement.childrenChip", { count: order.counts.children }));
  }

  return (
    <AnimatedListItem index={index} style={{ marginTop: theme.spacing.sm }}>
      <Card variant="elevated">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={
            expanded ? t("contacts.ordersMovement.collapse") : t("contacts.ordersMovement.expand")
          }
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={[theme.typography.bodyMedium, { color: theme.colors.textMuted }]}>
              {expanded ? "▾" : "▸"}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Pressable onPress={openOrder} style={{ flex: 1, minWidth: 0 }}>
                  <Text style={theme.typography.bodyMedium} numberOfLines={1}>
                    №{order.orderNumber}
                  </Text>
                </Pressable>
                <Text style={[theme.typography.bodyMedium, { flexShrink: 0 }]}>
                  {formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {order.orderStage ? (
                  <StatusPill label={orderStageLabel(order.orderStage)} tone={stageTone(order.orderStage)} />
                ) : null}
                <StatusPill
                  label={paymentStatusLabel(order.paymentStatus)}
                  tone={paymentStatusTone(order.paymentStatus)}
                />
              </View>
              <Text
                style={[
                  theme.typography.caption,
                  { color: theme.colors.textMuted, marginTop: 6, lineHeight: 18 },
                ]}
              >
                {[
                  formatShortDate(order.createdAt),
                  `${t("contacts.ordersMovement.paid")} ${formatOrderAmount(order.paidAmount, order.currency, order.exchangeRate)}`,
                  order.debtAmount > 0
                    ? `${t("contacts.ordersMovement.debt")} ${formatOrderAmount(order.debtAmount, order.currency, order.exchangeRate)}`
                    : null,
                  order.returnAdjustmentAmount > 0
                    ? `${t("contacts.ordersMovement.returnAdjustment")} ${formatOrderAmount(order.returnAdjustmentAmount, order.currency, order.exchangeRate)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {chips.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {chips.map((chip) => (
                    <StatusPill
                      key={chip}
                      label={chip}
                      tone={chip === t("contacts.ordersMovement.openReturns") ? "warning" : "default"}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </Pressable>

        {expanded ? (
          <View style={{ marginTop: theme.spacing.md, gap: theme.spacing.md }}>
            <Section title={t("contacts.ordersMovement.finance")}>
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, lineHeight: 18 }]}>
                {t("contacts.ordersMovement.total")}{" "}
                {formatOrderAmount(order.totalAmount, order.currency, order.exchangeRate)}
                {" · "}
                {t("contacts.ordersMovement.paid")}{" "}
                {formatOrderAmount(order.paidAmount, order.currency, order.exchangeRate)}
                {order.debtAmount > 0
                  ? ` · ${t("contacts.ordersMovement.debt")} ${formatOrderAmount(order.debtAmount, order.currency, order.exchangeRate)}`
                  : ""}
                {order.creditAmount > 0
                  ? ` · ${t("contacts.ordersMovement.credit")} ${formatOrderAmount(order.creditAmount, order.currency, order.exchangeRate)}`
                  : ""}
              </Text>
            </Section>

            <Section title={t("contacts.ordersMovement.payments")}>
              {order.paymentsSummary.length === 0 ? (
                <Muted>{t("contacts.ordersMovement.noPayments")}</Muted>
              ) : (
                order.paymentsSummary.map((p) => (
                  <View
                    key={p.id}
                    style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 4 }}
                  >
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, flex: 1 }]}>
                      {paymentSourceLabel(p.sourceType)} · {formatShortDate(p.paidAt)}
                    </Text>
                    <Text style={theme.typography.caption}>
                      {formatSignedAmount(p.amount, p.currency)}
                    </Text>
                  </View>
                ))
              )}
            </Section>

            <Section title={t("contacts.ordersMovement.returns")}>
              {order.returnsSummary.length === 0 ? (
                <Muted>{t("contacts.ordersMovement.noReturns")}</Muted>
              ) : (
                order.returnsSummary.map((ret) => (
                  <Pressable
                    key={ret.id}
                    onPress={openOrder}
                    style={{ marginTop: 6 }}
                  >
                    <Text style={theme.typography.caption}>{returnStatusLabel(ret.status)}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                      {formatShortDate(ret.requestedAt)}
                      {Number(ret.creditAmount ?? 0) > 0
                        ? ` · ${t("contacts.ordersMovement.creditAmount")} ${Number(ret.creditAmount).toFixed(2)}`
                        : ""}
                      {Number(ret.refundAmount ?? 0) > 0
                        ? ` · ${t("contacts.ordersMovement.refundAmount")} ${Number(ret.refundAmount).toFixed(2)}`
                        : ""}
                    </Text>
                    {ret.replacementOrderNumber ? (
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                        {t("contacts.ordersMovement.replacementOrder", {
                          number: ret.replacementOrderNumber,
                        })}
                      </Text>
                    ) : null}
                  </Pressable>
                ))
              )}
            </Section>

            <Section title={t("contacts.ordersMovement.children")}>
              {order.children.length === 0 ? (
                <Muted>{t("contacts.ordersMovement.noChildren")}</Muted>
              ) : (
                order.children.map((child) => (
                  <ChildRow
                    key={child.id}
                    child={child}
                    parentOrderNumber={order.orderNumber}
                    parentHasPayments={order.counts.payments > 0}
                  />
                ))
              )}
            </Section>

            <Pressable onPress={openOrder}>
              <Text style={[theme.typography.bodyMedium, { color: theme.colors.primary }]}>
                {t("contacts.ordersMovement.openOrder")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
    </AnimatedListItem>
  );
}

function ChildRow({
  child,
  parentOrderNumber,
  parentHasPayments,
}: {
  child: ContactOrderMovementChild;
  parentOrderNumber: string;
  parentHasPayments: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push(`/orders/${child.id}`)}
      style={{
        marginTop: 6,
        padding: 10,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.chip,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
        <Text style={theme.typography.bodyMedium}>№{child.orderNumber}</Text>
        <Text style={theme.typography.caption}>
          {formatOrderAmount(child.totalAmount, child.currency, child.exchangeRate)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        {child.orderStage ? (
          <StatusPill label={orderStageLabel(child.orderStage)} tone={stageTone(child.orderStage)} />
        ) : null}
        <StatusPill
          label={paymentStatusLabel(child.paymentStatus)}
          tone={paymentStatusTone(child.paymentStatus)}
        />
      </View>
      {child.counts.payments === 0 && parentHasPayments ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 6 }]}>
          {t("contacts.ordersMovement.paymentsOnParent", { number: parentOrderNumber })}
        </Text>
      ) : null}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View>
      <Text
        style={[
          theme.typography.caption,
          { color: theme.colors.textMuted, textTransform: "uppercase", marginBottom: 2 },
        ]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Muted({ children }: { children: string }) {
  const theme = useTheme();
  return <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>{children}</Text>;
}
