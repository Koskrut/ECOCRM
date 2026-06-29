import { MotiView } from "moti";
import React from "react";
import type { StyleProp, ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
};

export function AnimatedListItem({ children, index = 0, style }: Props) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: "timing", duration: 320, delay: Math.min(index * 40, 240) }}
      style={style}>
      {children}
    </MotiView>
  );
}
