import { useFocusEffect } from "@react-navigation/native";
import React from "react";
import { StyleSheet, View } from "react-native";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CallsQueuePanel } from "@/components/work/CallsQueuePanel";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

export default function CallsQueueScreen() {
  useFocusEffect(() => {});

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("calls.queueTitle")} />
      <CallsQueuePanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
});
