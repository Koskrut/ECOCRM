import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout } from "@/lib/design/tokens";

/** Bottom inset for floating tab bar (height + safe area + margin). */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return layout.tabBarHeight + Math.max(insets.bottom, 8) + 20;
}
