import React from "react";
import { StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  onFallback: () => void;
};

type State = { hasError: boolean };

/** Catches native map render failures and falls back to static preview. */
export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    if (__DEV__) console.warn("[MapErrorBoundary]", error.message);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return <MapErrorFallback onFallback={this.props.onFallback} />;
    }
    return this.props.children;
  }
}

function MapErrorFallback({ onFallback }: { onFallback: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.colors.surfaceMuted }]}>
      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, textAlign: "center" }]}>
        {t("map.interactiveFailed")}
      </Text>
      <AppButton
        label={t("map.useStaticPreview")}
        onPress={onFallback}
        variant="secondary"
        style={{ marginTop: theme.spacing.sm, alignSelf: "center" }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    padding: 16,
  },
});
