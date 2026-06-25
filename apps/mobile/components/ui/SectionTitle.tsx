import React from "react";
import { StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { spacing, typography } from "@/lib/design/tokens";

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionTitle({ title, subtitle }: Props) {
  return (
    <>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.section, marginTop: spacing.lg, marginBottom: spacing.sm },
  subtitle: { opacity: 0.7, marginBottom: spacing.sm, fontSize: 13, lineHeight: 18 },
});
