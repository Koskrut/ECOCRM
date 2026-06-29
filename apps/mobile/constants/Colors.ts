import { darkTheme, lightTheme } from "@/lib/design/tokens";

/** @deprecated Use useTheme() instead */
export default {
  light: {
    text: lightTheme.colors.text,
    background: lightTheme.colors.bg,
    tint: lightTheme.colors.primary,
    tabIconDefault: lightTheme.colors.textMuted,
    tabIconSelected: lightTheme.colors.primary,
  },
  dark: {
    text: darkTheme.colors.text,
    background: darkTheme.colors.bg,
    tint: darkTheme.colors.primary,
    tabIconDefault: darkTheme.colors.textMuted,
    tabIconSelected: darkTheme.colors.primary,
  },
};
