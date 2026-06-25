import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { activitiesApi } from "@/lib/api/activities";
import { t } from "@/lib/i18n";

export default function NewContactActivityScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSave() {
    if (!token || !contactId) return;
    if (!body.trim()) {
      Alert.alert(t("common.error"), "Вкажіть текст нотатки");
      return;
    }
    setBusy(true);
    try {
      await activitiesApi.createForContact(token, contactId, { kind: "NOTE", body: body.trim() });
      Alert.alert(t("common.done"), "Нотатку додано", [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Нотатка</Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Що домовились / наступний крок…"
        placeholderTextColor="#888"
        style={styles.input}
        multiline
      />
      <Pressable
        onPress={() => void onSave()}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.btnPrimary, (pressed || busy) && { opacity: 0.75 }]}>
        <Text style={styles.btnPrimaryText}>{busy ? "…" : t("common.save")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 140,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  btnPrimary: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

