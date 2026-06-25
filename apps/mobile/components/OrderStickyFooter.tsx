import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Text } from "@/components/Themed";
import { colors, layout, spacing } from "@/lib/design/tokens";

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
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      <Text style={styles.total}>{totalLabel}</Text>
      <View style={styles.actions}>
        {secondaryLabel && onSecondary ? (
          <PrimaryButton
            label={secondaryLabel}
            onPress={onSecondary}
            variant="secondary"
            style={styles.btn}
          />
        ) : null}
        <PrimaryButton
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: "rgba(15,17,23,0.96)",
    minHeight: layout.stickyFooterHeight,
  },
  total: { fontWeight: "700", fontSize: 16, marginBottom: spacing.sm },
  actions: { flexDirection: "row", gap: spacing.sm },
  btn: { flex: 1 },
});
