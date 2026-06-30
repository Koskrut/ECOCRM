import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";

import { TaskRow } from "@/components/TaskRow";
import { TaskDueSection } from "@/components/task/TaskDueSection";
import { Text } from "@/components/Themed";
import { EmptyState } from "@/components/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { tasksApi } from "@/lib/api/tasks";
import { addDays } from "@/lib/date";
import { useTheme } from "@/lib/design/theme-context";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";
import type { Task } from "@/types/crm";

export default function TaskDetailScreen() {
  const router = useRouter();
  const theme = useTheme();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const taskId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { token } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDueAt, setEditDueAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const row = await tasksApi.getById(token, taskId);
      setTask(row);
      setEditTitle(row.title);
      setEditBody(row.body ?? "");
      setEditDueAt(row.dueAt ?? null);
    } catch (e) {
      setTask(null);
      setLoadError(e instanceof Error ? e.message : t("tasks.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDueChange = useCallback((next: string | null) => {
    setEditDueAt(next);
  }, []);

  async function onComplete() {
    if (!token || !task) return;
    setBusy(true);
    try {
      await tasksApi.complete(token, task.id);
      await load();
    } catch (e) {
      if (isOfflineLikeError(e)) {
        await enqueueOfflineJob("taskComplete", { taskId: task.id });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
        router.back();
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function onReschedule() {
    if (!token || !task) return;
    const presets = [
      { label: t("tasks.tomorrow"), days: 1 },
      { label: t("tasks.in3days"), days: 3 },
      { label: t("tasks.inWeek"), days: 7 },
    ];
    Alert.alert(
      t("tasks.rescheduleTitle"),
      task.title,
      [
        ...presets.map((p) => ({
          text: p.label,
          onPress: () => void rescheduleTask(addDays(new Date(), p.days)),
        })),
        { text: t("common.cancel"), style: "cancel" as const },
      ],
    );
  }

  async function rescheduleTask(due: Date) {
    if (!token || !task) return;
    setBusy(true);
    try {
      await tasksApi.update(token, task.id, { dueAt: due.toISOString() });
      await load();
    } catch (e) {
      if (isOfflineLikeError(e)) {
        await enqueueOfflineJob("taskUpdate", { taskId: task.id, body: { dueAt: due.toISOString() } });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!token || !task) return;
    if (!editTitle.trim()) {
      Alert.alert(t("common.error"), t("tasks.titleRequired"));
      return;
    }
    setBusy(true);
    try {
      await tasksApi.update(token, task.id, {
        title: editTitle.trim(),
        body: editBody.trim() || null,
        dueAt: editDueAt,
      });
      setEditing(false);
      await load();
    } catch (e) {
      if (isOfflineLikeError(e)) {
        await enqueueOfflineJob("taskUpdate", {
          taskId: task.id,
          body: { title: editTitle.trim(), body: editBody.trim() || null, dueAt: editDueAt },
        });
        Alert.alert(t("common.done"), t("common.offlineQueued"));
        setEditing(false);
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  function onCancelTask() {
    if (!token || !task) return;
    Alert.alert(t("tasks.cancelConfirmTitle"), t("tasks.cancelConfirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("tasks.cancel"),
        style: "destructive",
        onPress: () => void confirmCancelTask(),
      },
    ]);
  }

  async function confirmCancelTask() {
    if (!token || !task) return;
    setBusy(true);
    try {
      await tasksApi.cancel(token, task.id);
      await load();
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={[theme.typography.body, { color: theme.colors.textMuted, marginTop: theme.spacing.md }]}>
            {t("common.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  if (!task) {
    return (
      <Screen gradient={false} padded={false}>
        <View style={styles.centered}>
          <EmptyState message={loadError ?? t("tasks.notFound")} onRetry={loadError ? () => void load() : undefined} />
          <AppButton label={t("common.back")} onPress={() => router.back()} variant="ghost" />
        </View>
      </Screen>
    );
  }

  const isOpen = task.status === "OPEN" || task.status === "IN_PROGRESS";

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
        ]}>
        {editing ? (
          <View style={{ marginBottom: theme.spacing.lg }}>
            <TextField
              value={editTitle}
              onChangeText={setEditTitle}
              label={t("tasksForm.title")}
              placeholder={t("tasksForm.titlePlaceholder")}
            />
            <TextField
              value={editBody}
              onChangeText={setEditBody}
              placeholder={t("tasks.bodyOptional")}
              multiline
              style={{ minHeight: 100, textAlignVertical: "top" }}
            />
            <TaskDueSection dueAt={editDueAt} onChange={handleDueChange} />
            <View style={styles.editActions}>
              <AppButton
                label={t("tasks.saveChanges")}
                onPress={() => void onSaveEdit()}
                loading={busy}
              />
              <AppButton
                label={t("common.cancel")}
                onPress={() => {
                  setEditing(false);
                  setEditTitle(task.title);
                  setEditBody(task.body ?? "");
                  setEditDueAt(task.dueAt ?? null);
                }}
                variant="ghost"
              />
            </View>
          </View>
        ) : (
          <>
            <TaskRow
              task={task}
              onComplete={isOpen ? () => void onComplete() : undefined}
              onReschedule={isOpen ? onReschedule : undefined}
              busy={busy}
            />
            {isOpen ? (
              <View style={styles.rowActions}>
                <AppButton
                  label={t("tasks.edit")}
                  onPress={() => setEditing(true)}
                  variant="secondary"
                  style={{ alignSelf: "flex-start" }}
                />
                <AppButton
                  label={t("tasks.cancel")}
                  onPress={onCancelTask}
                  variant="ghost"
                  style={{ alignSelf: "flex-start" }}
                />
              </View>
            ) : null}
          </>
        )}

        {task.contact?.id ? (
          <AppButton
            label={t("tasks.openContact")}
            onPress={() => router.push(`/contact/${task.contact!.id}`)}
            variant="ghost"
            style={{ marginTop: theme.spacing.lg, alignSelf: "flex-start" }}
          />
        ) : null}
        <AppButton
          label={t("common.back")}
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: theme.spacing.md, alignSelf: "center" }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { paddingTop: 8 },
  editActions: { gap: 8, marginTop: 8 },
  rowActions: { gap: 8, marginTop: 12 },
});
