import React, { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { warehousesApi } from "@/lib/api/warehouses";
import {
  getVisibleStageTargets,
  isForwardStageTransition,
  isPastConfirmedStage,
  isStageTransitionBlocked,
  managerCanAdvancePastConfirmed,
  TERMINAL_STAGES,
} from "@/lib/order-stage";
import { orderHasTtn } from "@/lib/order-utils";
import { useTheme } from "@/lib/design/theme-context";
import { spacing } from "@/lib/design/tokens";
import { orderStageLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";
import type { Order } from "@/types/crm";

type Props = {
  order: Order;
  busy?: boolean;
  onChangeStage: (toStage: string) => Promise<void>;
};

export function OrderStageControl({ order, busy, onChangeStage }: Props) {
  const theme = useTheme();
  const { token, user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [warehouseResponsibleUserId, setWarehouseResponsibleUserId] = useState<string | null>(
    null,
  );
  const currentStage = order.orderStage ?? order.status ?? "NEW";

  useEffect(() => {
    const warehouseId = order.warehouseId ?? order.warehouse?.id ?? null;
    if (!token || !warehouseId) {
      setWarehouseResponsibleUserId(null);
      return;
    }
    let cancelled = false;
    void warehousesApi
      .list(token)
      .then((rows) => {
        if (cancelled) return;
        const wh = rows.find((w) => w.id === warehouseId);
        setWarehouseResponsibleUserId(wh?.responsibleUserId ?? null);
      })
      .catch(() => {
        if (!cancelled) setWarehouseResponsibleUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, order.warehouseId, order.warehouse?.id]);

  const isManager = String(user?.role ?? "").toUpperCase() === "MANAGER";
  const canAdvancePastConfirmed =
    !isManager ||
    managerCanAdvancePastConfirmed({
      actorId: user?.id,
      ownerId: order.ownerId,
      warehouseResponsibleUserId,
    });

  const targets = useMemo(
    () =>
      getVisibleStageTargets(currentStage, order.paymentType, {
        capPastConfirmed: isManager && !canAdvancePastConfirmed,
      }),
    [canAdvancePastConfirmed, currentStage, isManager, order.paymentType],
  );

  if (TERMINAL_STAGES.has(currentStage) && targets.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{t("orderCreate.stage")}</Text>
        <Text style={[styles.current, { color: theme.colors.order }]}>{orderStageLabel(currentStage)}</Text>
      </View>
    );
  }

  function requestStage(toStage: string) {
    const hasTtn = orderHasTtn(order);
    if (
      isStageTransitionBlocked(currentStage, toStage, {
        paymentType: order.paymentType,
        deliveryMethod: order.deliveryMethod,
        hasTtn,
      })
    ) {
      if (isForwardStageTransition(currentStage, toStage) && !order.paymentType) {
        Alert.alert(t("common.error"), t("orderCreate.stageNeedPayment"));
        return;
      }
      if (toStage === "CONFIRMED" && order.deliveryMethod === "NOVA_POSHTA" && !hasTtn) {
        Alert.alert(t("common.error"), t("orderCreate.stageNeedTtn"));
        return;
      }
    }

    if (isManager && !canAdvancePastConfirmed && isPastConfirmedStage(toStage)) {
      Alert.alert(t("common.error"), t("orderCreate.stageManagerPastConfirmed"));
      return;
    }

    Alert.alert(
      t("orderCreate.stageChangeTitle"),
      `${orderStageLabel(currentStage)} → ${orderStageLabel(toStage)}?`,
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.ok"),
          onPress: () => {
            setUpdating(true);
            void onChangeStage(toStage)
              .catch((e) =>
                Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setUpdating(false));
          },
        },
      ],
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{t("orderCreate.stage")}</Text>
      <Text style={[styles.current, { color: theme.colors.order }]}>{orderStageLabel(currentStage)}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        {targets.map((stage) => (
          <Pressable
            key={stage}
            disabled={busy || updating}
            onPress={() => requestStage(stage)}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: theme.colors.chip,
                borderColor: theme.colors.border,
              },
              pressed && { opacity: 0.75 },
            ]}
            accessibilityRole="button">
            <Text style={[styles.chipText, { color: theme.colors.text }]}>{orderStageLabel(stage)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, marginBottom: spacing.sm },
  title: { fontWeight: "700", fontSize: 16 },
  current: { marginTop: 4, marginBottom: spacing.sm, fontWeight: "600" },
  scroll: { flexGrow: 0 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    marginRight: spacing.sm,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
});
