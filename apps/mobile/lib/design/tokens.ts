import type { TextStyle, ViewStyle } from "react-native";

export type ColorPalette = {
  bg: string;
  bgElevated: string;
  surface: string;
  surfaceMuted: string;
  surfaceGlass: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textInverse: string;
  primary: string;
  primaryMuted: string;
  primaryText: string;
  primaryGradientStart: string;
  primaryGradientEnd: string;
  success: string;
  successMuted: string;
  successText: string;
  warning: string;
  warningMuted: string;
  warningText: string;
  danger: string;
  dangerMuted: string;
  dangerText: string;
  chip: string;
  chipOn: string;
  visit: string;
  visitMuted: string;
  order: string;
  orderMuted: string;
  call: string;
  callMuted: string;
  tabBar: string;
  tabBarBorder: string;
  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
};

export type Elevation = {
  sm: ViewStyle;
  md: ViewStyle;
  lg: ViewStyle;
};

export type Typography = {
  display: TextStyle;
  title: TextStyle;
  section: TextStyle;
  body: TextStyle;
  bodyMedium: TextStyle;
  caption: TextStyle;
  label: TextStyle;
  button: TextStyle;
};

export type Theme = {
  scheme: "light" | "dark";
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: Typography;
  elevation: Elevation;
  layout: typeof layout;
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

export const layout = {
  stickyFooterHeight: 72,
  minTouchTarget: 44,
  actionBarHeight: 52,
  tabBarHeight: 64,
  headerHeight: 56,
} as const;

const typography: Typography = {
  display: { fontSize: 28, fontWeight: "700", letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3 },
  section: { fontSize: 16, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: "500", lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400", lineHeight: 18 },
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  button: { fontSize: 16, fontWeight: "600" },
};

const darkColors: ColorPalette = {
  bg: "#0b0d12",
  bgElevated: "#12151c",
  surface: "#1a1d27",
  surfaceMuted: "rgba(255,255,255,0.06)",
  surfaceGlass: "rgba(26,29,39,0.72)",
  border: "rgba(148,163,184,0.18)",
  borderStrong: "rgba(148,163,184,0.32)",
  text: "#f8fafc",
  textMuted: "rgba(248,250,252,0.62)",
  textInverse: "#0f172a",
  primary: "#3b82f6",
  primaryMuted: "rgba(59,130,246,0.16)",
  primaryText: "#93c5fd",
  primaryGradientStart: "#3b82f6",
  primaryGradientEnd: "#2563eb",
  success: "#10b981",
  successMuted: "rgba(16,185,129,0.16)",
  successText: "#6ee7b7",
  warning: "#f59e0b",
  warningMuted: "rgba(245,158,11,0.16)",
  warningText: "#fcd34d",
  danger: "#ef4444",
  dangerMuted: "rgba(239,68,68,0.16)",
  dangerText: "#fca5a5",
  chip: "rgba(255,255,255,0.08)",
  chipOn: "rgba(59,130,246,0.22)",
  visit: "#10b981",
  visitMuted: "rgba(16,185,129,0.16)",
  order: "#3b82f6",
  orderMuted: "rgba(59,130,246,0.16)",
  call: "#f59e0b",
  callMuted: "rgba(245,158,11,0.16)",
  tabBar: "rgba(11,13,18,0.88)",
  tabBarBorder: "rgba(148,163,184,0.12)",
  overlay: "rgba(0,0,0,0.55)",
  skeleton: "rgba(255,255,255,0.06)",
  skeletonHighlight: "rgba(255,255,255,0.12)",
};

const lightColors: ColorPalette = {
  bg: "#f4f6fb",
  bgElevated: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "rgba(15,23,42,0.04)",
  surfaceGlass: "rgba(255,255,255,0.82)",
  border: "rgba(15,23,42,0.08)",
  borderStrong: "rgba(15,23,42,0.14)",
  text: "#0f172a",
  textMuted: "rgba(15,23,42,0.58)",
  textInverse: "#f8fafc",
  primary: "#2563eb",
  primaryMuted: "rgba(37,99,235,0.1)",
  primaryText: "#1d4ed8",
  primaryGradientStart: "#3b82f6",
  primaryGradientEnd: "#1d4ed8",
  success: "#059669",
  successMuted: "rgba(5,150,105,0.1)",
  successText: "#047857",
  warning: "#d97706",
  warningMuted: "rgba(217,119,6,0.1)",
  warningText: "#b45309",
  danger: "#dc2626",
  dangerMuted: "rgba(220,38,38,0.1)",
  dangerText: "#b91c1c",
  chip: "rgba(15,23,42,0.06)",
  chipOn: "rgba(37,99,235,0.12)",
  visit: "#059669",
  visitMuted: "rgba(5,150,105,0.1)",
  order: "#2563eb",
  orderMuted: "rgba(37,99,235,0.1)",
  call: "#d97706",
  callMuted: "rgba(217,119,6,0.1)",
  tabBar: "rgba(255,255,255,0.92)",
  tabBarBorder: "rgba(15,23,42,0.06)",
  overlay: "rgba(15,23,42,0.35)",
  skeleton: "rgba(15,23,42,0.06)",
  skeletonHighlight: "rgba(15,23,42,0.1)",
};

function makeElevation(scheme: "light" | "dark"): Elevation {
  const shadowColor = scheme === "dark" ? "#000" : "#0f172a";
  return {
    sm: {
      shadowColor,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: scheme === "dark" ? 0.25 : 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    md: {
      shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: scheme === "dark" ? 0.32 : 0.1,
      shadowRadius: 12,
      elevation: 4,
    },
    lg: {
      shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: scheme === "dark" ? 0.4 : 0.14,
      shadowRadius: 20,
      elevation: 8,
    },
  };
}

export const darkTheme: Theme = {
  scheme: "dark",
  colors: darkColors,
  spacing,
  radius,
  typography,
  elevation: makeElevation("dark"),
  layout,
};

export const lightTheme: Theme = {
  scheme: "light",
  colors: lightColors,
  spacing,
  radius,
  typography,
  elevation: makeElevation("light"),
  layout,
};

/** @deprecated Use useTheme().colors instead */
export const colors = darkColors;
