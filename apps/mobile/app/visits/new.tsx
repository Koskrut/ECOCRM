import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ContactRow } from "@/components/ContactRow";
import { EmptyState } from "@/components/EmptyState";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { visitsApi } from "@/lib/api/visits";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

export default function NewVisitScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const rawContactId = useLocalSearchParams<{ contactId?: string }>().contactId;
  const preselectedContactId = typeof rawContactId === "string" && rawContactId ? rawContactId : null;

  const [contact, setContact] = useState<Contact | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);

  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => !!contact && !busy, [contact, busy]);

  const loadPreselected = useCallback(async () => {
    if (!token || !preselectedContactId) return;
    try {
      const c = await contactsApi.getById(token, preselectedContactId);
      setContact(c);
    } catch {
      // ignore; user can re-select
    }
  }, [token, preselectedContactId]);

  useEffect(() => {
    void loadPreselected();
  }, [loadPreselected]);

  useEffect(() => {
    const q = query.trim();
    if (!token) return;
    if (!q) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const res = await contactsApi.search(token, q);
          setResults(res.items ?? []);
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => clearTimeout(id);
  }, [token, query]);

  async function onCreate() {
    if (!token || !contact) return;
    setBusy(true);
    try {
      const v = await visitsApi.create(token, {
        contactId: contact.id,
        title: title.trim() || null,
        phone: contact.phone || null,
        addressText: contact.address ?? null,
        lat: contact.lat ?? null,
        lng: contact.lng ?? null,
        purpose: purpose.trim() || null,
      });
      Alert.alert(t("common.done"), "Візит створено", [
        { text: t("common.ok"), onPress: () => router.replace(`/visit/${v.id}`) },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.heading}>Новий візит</Text>

      <Text style={styles.section}>Клієнт</Text>
      {contact ? (
        <View style={styles.selected}>
          <Text style={styles.selectedName}>
            {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phone}
          </Text>
          <Text style={styles.selectedMeta}>{contact.company?.name ?? contact.address ?? ""}</Text>
          <Pressable
            onPress={() => setContact(null)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.link, pressed && { opacity: 0.7 }]}>
            <Text style={styles.linkText}>Змінити</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("clients.searchHint")}
            placeholderTextColor="#888"
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
          {query.trim() && results.length === 0 && !searching ? (
            <EmptyState message={t("clients.empty")} />
          ) : null}
          {results.map((c) => (
            <ContactRow key={c.id} contact={c} onPress={() => setContact(c)} />
          ))}
          <Pressable
            onPress={() => router.push("/contacts/new")}
            accessibilityRole="button"
            style={({ pressed }) => [styles.btnGhost, pressed && { opacity: 0.75 }]}>
            <Text style={{ fontWeight: "600" }}>Створити контакт</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.section}>Деталі</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Назва (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
      />
      <TextInput
        value={purpose}
        onChangeText={setPurpose}
        placeholder="Мета (опційно)"
        placeholderTextColor="#888"
        style={styles.input}
      />

      <Pressable
        disabled={!canSubmit}
        onPress={() => void onCreate()}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.btnPrimary,
          (!canSubmit || pressed) && { opacity: 0.75 },
        ]}>
        <Text style={styles.btnPrimaryText}>{busy ? "…" : "Створити візит"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  section: { fontWeight: "700", fontSize: 16, marginTop: 14, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  selected: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
  },
  selectedName: { fontWeight: "700", fontSize: 16 },
  selectedMeta: { marginTop: 6, opacity: 0.75, lineHeight: 20 },
  link: { marginTop: 10, alignSelf: "flex-start" },
  linkText: { color: "#2563eb", fontWeight: "600" },
  btnGhost: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbb",
    paddingHorizontal: 12,
    marginTop: 8,
  },
  btnPrimary: {
    marginTop: 16,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});

