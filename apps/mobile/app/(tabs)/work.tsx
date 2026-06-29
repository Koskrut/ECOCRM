import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AppHeader } from "@/components/ui/AppHeader";
import { Screen } from "@/components/ui/Screen";
import { WorkSegmentControl, type WorkSegment } from "@/components/WorkSegmentControl";
import { CallsQueuePanel } from "@/components/work/CallsQueuePanel";
import { CatalogPanel } from "@/components/work/CatalogPanel";
import { OrdersPanel } from "@/components/work/OrdersPanel";
import { useAuth } from "@/context/auth-context";
import { useModules } from "@/context/modules-context";
import { manualCallingApi } from "@/lib/api/manual-calling";
import { t } from "@/lib/i18n";
import { orderStageLabel } from "@/lib/labels";
import type { OrderStagePreset } from "@/lib/order-list-presets";

type SegmentMeta = {
  orders: { count: number; total: number; stagePreset: OrderStagePreset };
  calls: { count: number };
  catalog: { count: number; total: number };
};

const EMPTY_META: SegmentMeta = {
  orders: { count: 0, total: 0, stagePreset: "all" },
  calls: { count: 0 },
  catalog: { count: 0, total: 0 },
};

export default function WorkScreen() {
  const { token } = useAuth();
  const { manualCallingEnabled } = useModules();
  const [segment, setSegment] = useState<WorkSegment>("orders");
  const [meta, setMeta] = useState<SegmentMeta>(EMPTY_META);

  useEffect(() => {
    if (!token || !manualCallingEnabled) return;
    void manualCallingApi
      .getQueue(token)
      .then((res) => setMeta((prev) => ({ ...prev, calls: { count: res.items?.length ?? 0 } })))
      .catch(() => undefined);
  }, [token, manualCallingEnabled]);

  const onOrdersMeta = useCallback(
    (next: { count: number; total: number; stagePreset: OrderStagePreset }) => {
      setMeta((prev) => ({ ...prev, orders: next }));
    },
    [],
  );

  const onCallsMeta = useCallback((next: { count: number }) => {
    setMeta((prev) => ({ ...prev, calls: next }));
  }, []);

  const onCatalogMeta = useCallback((next: { count: number; total: number }) => {
    setMeta((prev) => ({ ...prev, catalog: next }));
  }, []);

  const subtitle = useMemo(() => {
    if (segment === "orders") {
      const { count, total, stagePreset } = meta.orders;
      const stagePart =
        stagePreset === "all" ? t("orders.mineOnly") : orderStageLabel(stagePreset);
      if (total > 0 && count < total) {
        return `${stagePart} · ${t("work.shownOfTotal", { shown: count, total })}`;
      }
      if (count > 0) return `${stagePart} · ${t("orders.ordersCount", { count })}`;
      return t("work.ordersHint");
    }
    if (segment === "calls") {
      const { count } = meta.calls;
      if (count > 0) return t("calls.inQueue", { count });
      return t("work.callsHint");
    }
    const { count, total } = meta.catalog;
    if (total > 0) return t("work.shownOfTotal", { shown: count, total });
    return t("work.catalogHint");
  }, [segment, meta]);

  return (
    <Screen edges={["top", "left", "right"]} padded>
      <AppHeader title={t("tabs.work")} subtitle={subtitle} large={false} />
      <WorkSegmentControl
        value={segment}
        onChange={setSegment}
        showCalls={manualCallingEnabled}
        badges={{ calls: meta.calls.count > 0 ? meta.calls.count : undefined }}
      />
      <View style={styles.panel}>
        {segment === "orders" ? <OrdersPanel onMetaChange={onOrdersMeta} /> : null}
        {segment === "calls" && manualCallingEnabled ? (
          <CallsQueuePanel onMetaChange={onCallsMeta} />
        ) : null}
        {segment === "catalog" ? <CatalogPanel onMetaChange={onCatalogMeta} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1 },
});
