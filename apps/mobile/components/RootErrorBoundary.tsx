import React from "react";
import { DevSettings, Pressable, StyleSheet, Text, View } from "react-native";

import { appendErrorLog } from "@/lib/error-log";

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
        <View style={styles.container}>
          <Text style={styles.title}>Помилка</Text>
          <Text style={styles.body}>Перезапустіть додаток або спробуйте ще раз.</Text>
          {__DEV__ ? (
            <Text style={styles.detail}>{this.state.error.message}</Text>
          ) : null}
          <Pressable
            onPress={this.onRetry}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btn, pressed && { opacity: 0.75 }]}>
            <Text style={styles.btnText}>Спробувати знову</Text>
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
    backgroundColor: "#fff",
  },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  body: { textAlign: "center", lineHeight: 22, opacity: 0.8, marginBottom: 16 },
  detail: { fontSize: 12, opacity: 0.6, marginBottom: 16, textAlign: "center" },
  btn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
