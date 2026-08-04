import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useTheme } from "@/lib/design/theme-context";
import type { SelectOption } from "@/lib/contact-options";

type Props = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "—",
  disabled,
}: Props) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  return (
    <View style={styles.wrap}>
      <Text style={[theme.typography.caption, styles.label]}>{label}</Text>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[
          styles.input,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: theme.colors.border,
            opacity: disabled ? 0.6 : 1,
          },
        ]}>
        <Text
          style={[
            theme.typography.body,
            { color: selected?.value ? theme.colors.text : theme.colors.textMuted },
          ]}
          numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
      </Pressable>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Pressable
              key={opt.value || "__empty"}
              onPress={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              style={[
                styles.option,
                {
                  backgroundColor: active ? theme.colors.chipOn : "transparent",
                  borderColor: theme.colors.border,
                },
              ]}>
              <Text
                style={[
                  theme.typography.body,
                  { color: theme.colors.text, fontWeight: active ? "700" : "400" },
                ]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 48,
    justifyContent: "center",
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
});
