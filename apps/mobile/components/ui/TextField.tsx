import React from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { Text } from "@/components/Themed";
import { useTheme } from "@/lib/design/theme-context";

type Props = TextInputProps & {
  label?: string;
  error?: string | null;
};

export const TextField = React.forwardRef<TextInput, Props>(function TextField(
  { label, error, style, multiline, scrollEnabled, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[theme.typography.caption, styles.label]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        {...rest}
        multiline={multiline}
        scrollEnabled={multiline ? false : scrollEnabled}
        placeholderTextColor={theme.colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: error ? theme.colors.danger : focused ? theme.colors.primary : theme.colors.border,
          },
          multiline ? styles.multiline : null,
          style,
        ]}
      />
      {error ? (
        <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: 4 }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    minHeight: 48,
  },
  multiline: {
    textAlignVertical: "top",
  },
});
