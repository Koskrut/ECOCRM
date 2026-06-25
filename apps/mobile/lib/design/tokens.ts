/** Shared mobile design tokens for consistent product UI. */
export const colors = {
  bg: "#0f1117",
  surface: "#1a1d27",
  surfaceMuted: "rgba(120,120,128,0.12)",
  border: "rgba(148,163,184,0.22)",
  text: "#f8fafc",
  textMuted: "rgba(248,250,252,0.68)",
  primary: "#3b82f6",
  primaryMuted: "rgba(59,130,246,0.16)",
  primaryText: "#93c5fd",
  success: "#10b981",
  successMuted: "rgba(16,185,129,0.16)",
  successText: "#6ee7b7",
  warning: "#f59e0b",
  warningMuted: "rgba(245,158,11,0.16)",
  warningText: "#fcd34d",
  danger: "#ef4444",
  chip: "rgba(120,120,128,0.14)",
  chipOn: "rgba(59,130,246,0.2)",
  visit: "#10b981",
  visitMuted: "rgba(16,185,129,0.16)",
  order: "#3b82f6",
  orderMuted: "rgba(59,130,246,0.16)",
  call: "#f59e0b",
  callMuted: "rgba(245,158,11,0.16)",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
};

export const layout = {
  stickyFooterHeight: 72,
  minTouchTarget: 44,
  actionBarHeight: 52,
};

export const typography = {
  title: { fontSize: 22, fontWeight: "700" as const },
  section: { fontSize: 16, fontWeight: "700" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
};
