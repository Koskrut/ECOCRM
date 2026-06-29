import * as Haptics from "expo-haptics";
import React from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { useTheme } from "@/lib/design/theme-context";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const theme = useTheme();
  const [width, setWidth] = React.useState(0);
  const index = options.findIndex((o) => o.value === value);
  const translateX = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    const segmentW = w / options.length;
    translateX.value = withSpring(index * segmentW, { damping: 18, stiffness: 220 });
  };

  React.useEffect(() => {
    if (width <= 0) return;
    const segmentW = width / options.length;
    translateX.value = withSpring(index * segmentW, { damping: 18, stiffness: 220 });
  }, [index, width, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    width: width > 0 ? width / options.length - 6 : 0,
  }));

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}>
      {width > 0 ? (
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: theme.colors.chipOn },
            indicatorStyle,
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={styles.segment}
            accessibilityRole="button"
            onPress={() => {
              void Haptics.selectionAsync();
              onChange(opt.value);
            }}>
            <Text
              style={[
                styles.label,
                { color: active ? theme.colors.primaryText : theme.colors.textMuted },
              ]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: 12,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 3,
    left: 3,
    bottom: 3,
    borderRadius: 10,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
});
