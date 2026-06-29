import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Chip } from "@/components/ui/Chip";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { contactsApi } from "@/lib/api/contacts";
import { tasksApi } from "@/lib/api/tasks";
import { addDays } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function NewTaskScreen() {
  const router = useRouter();
  const theme = useTheme();
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
    void contactsApi
      .getById(token, preselectedContactId)
      .then((c) => {
        setContactLabel([c.firstName, c.lastName].filter(Boolean).join(" ") || c.phone);
      })
      .catch(() => {});
  }, [token, preselectedContactId]);

  async function onCreate() {
    if (!token) return;
    if (!title.trim()) {
      Alert.alert(t("common.error"), t("tasks.titleRequired"));
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
      Alert.alert(t("common.done"), t("tasks.created"), [
        { text: t("common.ok"), onPress: () => router.replace(`/tasks/${task.id}`) },
      ]);
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg },
        ]}>
        <TextField
          value={title}
          onChangeText={setTitle}
          label={t("tasksForm.title")}
          placeholder={t("tasksForm.titlePlaceholder")}
        />
        <TextField
          value={body}
          onChangeText={setBody}
          placeholder={t("tasks.bodyOptional")}
          multiline
          style={{ minHeight: 120, textAlignVertical: "top" }}
        />
        <TextField
          value={dueAt}
          onChangeText={setDueAt}
          label={t("tasksForm.due")}
          placeholder={t("tasks.dueIsoPlaceholder")}
        />
        <View style={styles.presets}>
          {[
            { label: t("tasks.tomorrow"), days: 1 },
            { label: t("tasks.in3days"), days: 3 },
            { label: t("tasks.inWeek"), days: 7 },
          ].map((p) => (
            <Chip
              key={p.days}
              label={p.label}
              onPress={() => setDueAt(addDays(new Date(), p.days).toISOString())}
            />
          ))}
        </View>
        {contactLabel ? (
          <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: theme.spacing.md }]}>
            {t("tasks.contactHint", { label: contactLabel })}
          </Text>
        ) : null}
        <AppButton
          label={t("common.create")}
          onPress={() => void onCreate()}
          loading={busy}
          fullWidth
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
});
