import React from "react";
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type Props = ScrollViewProps & {
  extraBottomInset?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** @deprecated iOS uses automaticallyAdjustKeyboardInsets; Android uses window resize. */
  keyboardVerticalOffset?: number;
};

/**
 * Keyboard-aware scroll without double-adjustment (KAV + automaticAdjustKeyboardInsets
 * together caused the keyboard to jump on iOS).
 */
export function KeyboardAwareScrollView({
  children,
  contentContainerStyle,
  extraBottomInset = 0,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  ...rest
}: Props) {
  const theme = useTheme();
  const bottomPadding = extraBottomInset + theme.spacing.xxxl;

  return (
    <ScrollView
      {...rest}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      keyboardDismissMode={keyboardDismissMode}
      automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      contentContainerStyle={[contentContainerStyle, { paddingBottom: bottomPadding }]}>
      {children}
    </ScrollView>
  );
}
