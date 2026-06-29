import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from "react-native";

import { TaskRow } from "@/components/TaskRow";
import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
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
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token || !taskId) return;
    setLoading(true);
    try {
      const row = await tasksApi.getById(token, taskId);
      setTask(row);
    } finally {
      setLoading(false);
    }
  }, [token, taskId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (loading || !task) {
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

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl },
        ]}>
        <TaskRow
          task={task}
          onComplete={() => void onComplete()}
          onReschedule={onReschedule}
          busy={busy}
        />
        {task.contact?.id ? (
          <AppButton
            label={t("tasks.openContact")}
            onPress={() => router.push(`/contact/${task.contact!.id}`)}
            variant="ghost"
            style={{ marginTop: theme.spacing.lg, alignSelf: "flex-start" }}
          />
        ) : null}
        <AppButton
          label={t("common.cancel")}
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
});
