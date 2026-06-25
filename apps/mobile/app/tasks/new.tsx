import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { tasksApi } from "@/lib/api/tasks";
import { addDays } from "@/lib/date";
import { t } from "@/lib/i18n";

export default function NewTaskScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const preselectedContactId =
    typeof params.contactId === "string" && params.contactId ? params.contactId : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [contactId, setContactId] = useState<string | null>(preselectedContactId);
  const [contactLabel, setContactLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !preselectedContactId) return;
    void contactsApi.getById(token, preselectedContactId).then((c) => {
      setContactLabel([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone);
    }).catch(() => {});
  }, [token, preselectedContactId]);

  async function onCreate() {
    if (!token) return;
    if (!title.trim()) {
      Alert.alert(t("common.error"), "Вкажіть назву завдання");
      return;
    }
    setBusy(true);
    try {
      const task = await tasksApi.create(token, {
        title: title.trim(),
        body: body.trim() || null,
        dueAt: dueAt.trim() ? new Date(dueAt.trim()).toISOString() : null,
        contactId,
      });
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
      <TextInput
        value={dueAt}
        onChangeText={setDueAt}
        placeholder="Термін (ISO, напр. 2026-06-26T10:00:00)"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <View style={styles.presets}>
        {[
          { label: t("tasks.tomorrow"), days: 1 },
          { label: t("tasks.in3days"), days: 3 },
          { label: t("tasks.inWeek"), days: 7 },
        ].map((p) => (
          <Pressable
            key={p.days}
            onPress={() => setDueAt(addDays(new Date(), p.days).toISOString())}
            style={styles.presetBtn}
            accessibilityRole="button">
            <Text style={styles.presetText}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {contactLabel ? <Text style={styles.contactHint}>Контакт: {contactLabel}</Text> : null}
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
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  presetBtn: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  presetText: { fontWeight: "600", fontSize: 13 },
  contactHint: { marginBottom: 12, opacity: 0.75 },
  btnPrimary: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

