import React from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export type OrderWizardStep = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ n: OrderWizardStep; labelKey: string }> = [
  { n: 1, labelKey: "orderCreate.stepClient" },
  { n: 2, labelKey: "orderCreate.stepProducts" },
  { n: 3, labelKey: "orderCreate.stepPayment" },
  { n: 4, labelKey: "orderCreate.stepDelivery" },
  { n: 5, labelKey: "orderCreate.stepReview" },
];

type Props = {
  step: OrderWizardStep;
  maxReached: OrderWizardStep;
  onStepPress?: (step: OrderWizardStep) => void;
};

export function OrderCreateStepBar({ step, maxReached, onStepPress }: Props) {
  const theme = useTheme();
  const current = STEPS.find((s) => s.n === step);

  return (
    <View style={styles.wrap}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
        {t("orderCreate.stepOf", { current: step, total: 5 })}
        {current ? ` · ${t(current.labelKey)}` : ""}
      </Text>
      <View style={styles.row}>
        {STEPS.map((s) => {
          const done = s.n < step;
          const active = s.n === step;
          const reachable = s.n <= maxReached;
          return (
            <Pressable
              key={s.n}
              disabled={!reachable || !onStepPress}
              onPress={() => onStepPress?.(s.n)}
              style={styles.dotWrap}
              accessibilityRole="button">
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: active || done ? theme.colors.primary : theme.colors.surfaceMuted,
                    opacity: reachable ? 1 : 0.45,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "center", gap: 10 },
  dotWrap: { padding: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
