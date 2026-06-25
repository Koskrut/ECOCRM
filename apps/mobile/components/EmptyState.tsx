import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { t } from "@/lib/i18n";

type EmptyStateProps = {
  message: string;
  onRetry?: () => void;
};

export function EmptyState({ message, onRetry }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.75 }]}
          accessibilityRole="button">
          <Text style={styles.btnText}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 32, alignItems: "center", paddingHorizontal: 24 },
  text: { textAlign: "center", opacity: 0.7, lineHeight: 22, fontSize: 15 },
  btn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  btnText: { color: "#fff", fontWeight: "600" },
});
