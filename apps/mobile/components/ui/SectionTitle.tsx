import React from "react";
import { StyleSheet } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";

type Props = {
  title: string;
  subtitle?: string;
};

export function SectionTitle({ title, subtitle }: Props) {
  const theme = useTheme();

  return (
    <>
      <Text style={[theme.typography.section, styles.title]}>{title}</Text>
      {subtitle ? (
        <Text style={[theme.typography.caption, { color: theme.colors.textMuted }, styles.subtitle]}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 16, marginBottom: 8 },
  subtitle: { marginBottom: 8 },
});
