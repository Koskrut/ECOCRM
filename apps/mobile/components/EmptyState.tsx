import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  title?: string;
  message: string;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  onRetry?: () => void;
};

export function EmptyState({ title, message, icon = "file-tray-outline", onRetry }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Ionicons name={icon} size={32} color={theme.colors.textMuted} />
      </View>
      {title ? <Text style={[theme.typography.section, styles.title]}>{title}</Text> : null}
      <Text style={[theme.typography.body, { color: theme.colors.textMuted, textAlign: "center" }]}>
        {message}
      </Text>
      {onRetry ? (
        <AppButton label={t("common.retry")} onPress={onRetry} variant="secondary" style={styles.btn} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 8,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { textAlign: "center" },
  btn: { marginTop: 12, minWidth: 160 },
});
