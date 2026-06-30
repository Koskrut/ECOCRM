import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { Text } from "@/components/Themed";
import { TaskDueSection } from "@/components/task/TaskDueSection";
import { ContactPickerPanel } from "@/components/visit/ContactPickerPanel";
import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { contactDisplayName } from "@/lib/visit-create-utils";
import { contactsApi } from "@/lib/api/contacts";
import { tasksApi } from "@/lib/api/tasks";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";
import type { Contact } from "@/types/crm";

export default function NewTaskScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const preselectedContactId =
    typeof params.contactId === "string" && params.contactId ? params.contactId : null;

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleDueChange = useCallback((next: string | null) => {
    setDueAt(next);
  }, []);

  useEffect(() => {
    if (!token || !preselectedContactId) return;
    void contactsApi
      .getById(token, preselectedContactId)
      .then((c) => setContact(c))
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
        dueAt,
        contactId: contact?.id ?? null,
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

  if (!token) {
    return (
      <Screen>
        <View />
      </Screen>
    );
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
        <TaskDueSection dueAt={dueAt} onChange={handleDueChange} />

        <SectionTitle title={t("tasks.contactOptional")} />
        {contact ? (
          <View style={{ marginBottom: theme.spacing.md }}>
            <Text style={theme.typography.bodyMedium}>{contactDisplayName(contact)}</Text>
            <AppButton
              label={t("tasks.changeContact")}
              onPress={() => setShowContactPicker(true)}
              variant="ghost"
              style={{ alignSelf: "flex-start", marginTop: theme.spacing.sm }}
            />
          </View>
        ) : (
          <AppButton
            label={t("tasks.selectContact")}
            onPress={() => setShowContactPicker(true)}
            variant="secondary"
            style={{ marginBottom: theme.spacing.md }}
          />
        )}

        {showContactPicker ? (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <ContactPickerPanel
              token={token}
              onSelect={(c) => {
                setContact(c);
                setShowContactPicker(false);
              }}
            />
            <AppButton
              label={t("common.cancel")}
              onPress={() => setShowContactPicker(false)}
              variant="ghost"
              style={{ marginTop: theme.spacing.sm }}
            />
          </View>
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
});
