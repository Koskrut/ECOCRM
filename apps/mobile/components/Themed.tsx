import { Text as DefaultText, View as DefaultView, type TextStyle, type ViewStyle } from "react-native";

import { useTheme } from "@/lib/design/theme-context";

type ThemeProps = {
  lightColor?: string;
  darkColor?: string;
};

export type TextProps = ThemeProps & DefaultText["props"];
export type ViewProps = ThemeProps & DefaultView["props"];

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: "text" | "background" = "text",
) {
  const theme = useTheme();
  const colorFromProps = theme.scheme === "dark" ? props.dark : props.light;
  if (colorFromProps) return colorFromProps;
  return colorName === "background" ? theme.colors.bg : theme.colors.text;
}

const fontFamily = {
  "400": "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
} as const;

function resolveFontFamily(style: TextStyle | TextStyle[] | undefined): string | undefined {
  const flat = Array.isArray(style) ? Object.assign({}, ...style) : style ?? {};
  const weight = String(flat.fontWeight ?? "400");
  if (weight === "bold" || weight === "700") return fontFamily["700"];
  if (weight === "600") return fontFamily["600"];
  if (weight === "500") return fontFamily["500"];
  return fontFamily["400"];
}

export function Text(props: TextProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const color = useThemeColor({ light: lightColor, dark: darkColor }, "text");
  const fontFamilyName = resolveFontFamily(style as TextStyle);

  return (
    <DefaultText
      style={[{ color, fontFamily: fontFamilyName }, style]}
      {...otherProps}
    />
  );
}

export function View(props: ViewProps) {
  const { style, lightColor, darkColor, ...otherProps } = props;
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, "background");

  return <DefaultView style={[{ backgroundColor }, style] as ViewStyle[]} {...otherProps} />;
}
