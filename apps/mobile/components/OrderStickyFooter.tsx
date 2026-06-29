import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { useTheme } from "@/lib/design/theme-context";

type Props = {
  totalLabel: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export function OrderStickyFooter({
  totalLabel,
  actionLabel,
  onAction,
  disabled,
  loading,
  secondaryLabel,
  onSecondary,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.footer,
        {
          paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          borderTopColor: theme.colors.border,
          backgroundColor: theme.colors.bgElevated,
          minHeight: theme.layout.stickyFooterHeight,
        },
      ]}>
      <Text style={theme.typography.bodyMedium}>{totalLabel}</Text>
      <View style={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <AppButton
            label={secondaryLabel}
            onPress={onSecondary}
            variant="secondary"
            style={styles.btn}
          />
        ) : null}
        <AppButton
          label={actionLabel}
          onPress={onAction}
          disabled={disabled}
          loading={loading}
          style={styles.btn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 8 },
  btn: { flex: 1 },
});
