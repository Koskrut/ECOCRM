import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  title: string;
  onSeeAll?: () => void;
};

export function SectionHeader({ title, onSeeAll }: Props) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { marginTop: theme.spacing.md, marginBottom: theme.spacing.sm }]}>
      <Text style={theme.typography.section}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={8}>
          <Text style={[theme.typography.caption, { color: theme.colors.primary, fontWeight: "600" }]}>
            {t("today.seeAll")} ›
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
});
