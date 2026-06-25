import React, { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { WorkSegmentControl, type WorkSegment } from "@/components/WorkSegmentControl";
import { CallsQueuePanel } from "@/components/work/CallsQueuePanel";
import { CatalogPanel } from "@/components/work/CatalogPanel";
import { OrdersPanel } from "@/components/work/OrdersPanel";
import { useModules } from "@/context/modules-context";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

export default function WorkScreen() {
  const { manualCallingEnabled } = useModules();
  const [segment, setSegment] = useState<WorkSegment>("orders");

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("tabs.work")} />
      <WorkSegmentControl
        value={segment}
        onChange={setSegment}
        showCalls={manualCallingEnabled}
      />
      {segment === "orders" ? <OrdersPanel /> : null}
      {segment === "calls" && manualCallingEnabled ? <CallsQueuePanel /> : null}
      {segment === "catalog" ? <CatalogPanel /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
});
