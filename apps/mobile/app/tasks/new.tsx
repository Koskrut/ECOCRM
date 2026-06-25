import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { tasksApi } from "@/lib/api/tasks";
import { t } from "@/lib/i18n";

export default function NewTaskScreen() {
  const router = useRouter();
  const { token } = useAuth();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!title.trim()) {
      Alert.alert(t("common.error"), "Вкажіть назву завдання");
      return;
    }
    setBusy(true);
    try {
      const task = await tasksApi.create(token, { title: title.trim(), body: body.trim() || null });
      Alert.alert(t("common.done"), "Завдання створено", [
        { text: t("common.ok"), onPress: () => router.replace(`/tasks/${task.id}`) },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Нове завдання</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Назва *"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Опис (опційно)"
        placeholderTextColor="#888"
        style={[styles.input, { minHeight: 120 }]}
        multiline
      />
      <Pressable
        onPress={() => void onCreate()}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [styles.btnPrimary, (pressed || busy) && { opacity: 0.75 }]}>
        <Text style={styles.btnPrimaryText}>{busy ? "…" : "Створити"}</Text>
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
    marginBottom: 12,
    textAlignVertical: "top",
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

