import { Pressable, StyleSheet, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { Text } from "@/components/Themed";
import { colors, spacing } from "@/lib/design/tokens";
import type { Contact } from "@/types/crm";

export function contactDisplayName(c: Contact): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone || "—";
}

type ContactRowProps = {
  contact: Contact;
  onPress: () => void;
  onCall?: () => void;
  onNavigate?: () => void;
  onOrder?: () => void;
};

export function ContactRow({ contact, onPress, onCall, onNavigate, onOrder }: ContactRowProps) {
  const name = contactDisplayName(contact);
  const sub = contact.company?.name ?? contact.phone ?? contact.email ?? "";
  const showActions = !!(onCall || onNavigate || onOrder);

  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.main}>
        <Text style={styles.title}>{name}</Text>
        {sub ? <Text style={styles.meta}>{sub}</Text> : null}
      </View>
      {showActions ? (
        <View style={styles.actions}>
          {onCall ? (
            <Pressable onPress={onCall} style={styles.actionBtn} accessibilityRole="button">
              <Text style={styles.actionText}>📞</Text>
            </Pressable>
          ) : null}
          {onNavigate ? (
            <Pressable onPress={onNavigate} style={styles.actionBtn} accessibilityRole="button">
              <Text style={styles.actionText}>🗺</Text>
            </Pressable>
          ) : null}
          {onOrder ? (
            <Pressable onPress={onOrder} style={styles.actionBtn} accessibilityRole="button">
              <Text style={styles.actionText}>🛒</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.chev}>›</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
  main: { flex: 1 },
  title: { fontWeight: "600", fontSize: 17 },
  meta: { opacity: 0.7, marginTop: 4, fontSize: 14 },
  chev: { fontSize: 24, opacity: 0.4, marginLeft: 8 },
  actions: { flexDirection: "row", gap: 4, marginLeft: spacing.sm },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  actionText: { fontSize: 16 },
});
