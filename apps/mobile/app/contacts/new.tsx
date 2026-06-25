import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { t } from "@/lib/i18n";

export default function NewContactScreen() {
  const router = useRouter();
  const { token } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate() {
    if (!token) return;
    if (!phone.trim()) {
      Alert.alert(t("common.error"), "Вкажіть телефон");
      return;
    }
    setBusy(true);
    try {
      const c = await contactsApi.create(token, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() ? email.trim() : null,
        address: address.trim() ? address.trim() : null,
      });
      Alert.alert(t("common.done"), "Контакт створено", [
        {
          text: t("common.ok"),
          onPress: () => router.replace(`/visits/new?contactId=${encodeURIComponent(c.id)}`),
        },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Новий контакт</Text>
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder="Ім'я"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        placeholder="Прізвище"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={phone}
        onChangeText={setPhone}
        placeholder="Телефон *"
        placeholderTextColor="#888"
        style={styles.input}
        keyboardType="phone-pad"
      />
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Адреса (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
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

