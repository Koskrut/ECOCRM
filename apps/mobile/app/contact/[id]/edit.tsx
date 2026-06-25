import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { PrimaryButton } from "@/components/ui/PrimaryButton";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { spacing } from "@/lib/design/tokens";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

export default function EditContactScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const contactId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [contact, setContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !contactId) return;
    setLoading(true);
    try {
      const c = await contactsApi.getById(token, contactId);
      setContact(c);
      setFirstName(c.firstName ?? "");
      setLastName(c.lastName ?? "");
      setPhone(c.phone ?? "");
      setEmail(c.email ?? "");
      setAddress(c.address ?? "");
    } finally {
      setLoading(false);
    }
  }, [token, contactId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSave() {
    if (!token || !contactId) return;
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) {
      Alert.alert(t("common.error"), "Ім'я, прізвище та телефон обов'язкові");
      return;
    }
    setBusy(true);
    try {
      await contactsApi.patch(token, contactId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
      });
      Alert.alert(t("common.done"), t("common.save"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading || !contact) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <TextInput value={firstName} onChangeText={setFirstName} placeholder="Ім'я *" style={styles.input} />
      <TextInput value={lastName} onChangeText={setLastName} placeholder="Прізвище *" style={styles.input} />
      <TextInput value={phone} onChangeText={setPhone} placeholder="Телефон *" keyboardType="phone-pad" style={styles.input} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Email" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
      <TextInput value={address} onChangeText={setAddress} placeholder="Адреса" style={[styles.input, styles.multiline]} multiline />
      <PrimaryButton label={t("common.save")} onPress={() => void onSave()} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: spacing.lg, paddingBottom: 48 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
});
