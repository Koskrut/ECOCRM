import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Props = TextInputProps & {
  value: string;
  onChangeText: (text: string) => void;
};

export function SearchField({ style, placeholderTextColor, value, onChangeText, ...rest }: Props) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surfaceMuted,
          borderColor: focused ? theme.colors.primary : theme.colors.border,
        },
      ]}>
      <Ionicons name="search" size={18} color={theme.colors.textMuted} style={styles.icon} />
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={placeholderTextColor ?? theme.colors.textMuted}
        style={[styles.input, { color: theme.colors.text }, style]}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8} accessibilityRole="button">
          <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 12,
  },
  icon: { marginRight: 8 },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
  },
});
