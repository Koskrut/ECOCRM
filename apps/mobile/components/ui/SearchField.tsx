import React from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

import { colors, radius, spacing } from "@/lib/design/tokens";

type Props = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

export function SearchField({ style, placeholderTextColor = colors.textMuted, ...rest }: Props) {
  return (
    <TextInput
      {...rest}
      placeholderTextColor={placeholderTextColor}
      style={[styles.input, style]}
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
});
