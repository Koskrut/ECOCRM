import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { leadsApi } from "@/lib/api/leads";
import { t } from "@/lib/i18n";

export default function NewLeadScreen() {
  const router = useRouter();
  const { token } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!phone.trim() && !name.trim() && !companyName.trim()) {
      Alert.alert(t("common.error"), "Заповніть хоча б телефон або ім'я/компанію");
      return;
    }
    setBusy(true);
    try {
      await leadsApi.create(token, {
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
        companyName: companyName.trim() || undefined,
        message: message.trim() || undefined,
        source: "MANUAL",
      });
      Alert.alert(t("common.done"), "Лід створено", [{ text: t("common.ok"), onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Новий лід</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ім'я (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Телефон (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
        keyboardType="phone-pad"
      />
      <TextInput
        value={companyName}
        onChangeText={setCompanyName}
        placeholder="Компанія (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Коментар (опційно)"
        placeholderTextColor="#888"
        style={[styles.input, { minHeight: 90 }]}
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

