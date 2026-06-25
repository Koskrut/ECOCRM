import React from "react";
import { StyleSheet, View } from "react-native";

import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CatalogPanel } from "@/components/work/CatalogPanel";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";

export default function CatalogScreen() {
  return (
    <View style={styles.container}>
      <ScreenHeader title={t("catalog.title")} />
      <CatalogPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
});
