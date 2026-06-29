import React from "react";
import { DevSettings, Pressable, StyleSheet, Text, View } from "react-native";

import { lightTheme } from "@/lib/design/tokens";
import { appendErrorLog } from "@/lib/error-log";
import { t } from "@/lib/i18n";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    void appendErrorLog(error.message);
    if (__DEV__) console.error("[RootErrorBoundary]", error);
  }

  private onRetry = (): void => {
    if (__DEV__) {
      DevSettings.reload();
      return;
    }
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={[styles.container, { backgroundColor: lightTheme.colors.bg }]}>
          <Text style={[styles.title, { color: lightTheme.colors.text }]}>{t("common.error")}</Text>
          <Text style={[styles.body, { color: lightTheme.colors.textMuted }]}>
            {t("common.retry")}
          </Text>
          {__DEV__ ? (
            <Text style={[styles.detail, { color: lightTheme.colors.textMuted }]}>
              {this.state.error.message}
            </Text>
          ) : null}
          <Pressable
            onPress={this.onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: lightTheme.colors.primary },
              pressed && { opacity: 0.75 },
            ]}>
            <Text style={[styles.btnText, { color: lightTheme.colors.textInverse }]}>
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { textAlign: "center", lineHeight: 22, marginBottom: 16 },
  detail: { fontSize: 12, marginBottom: 16, textAlign: "center" },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { fontWeight: "600" },
});
