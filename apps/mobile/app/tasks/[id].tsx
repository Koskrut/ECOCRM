import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { TaskRow } from "@/components/TaskRow";
import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { tasksApi } from "@/lib/api/tasks";
import { enqueueOfflineJob, isOfflineLikeError } from "@/lib/offline-queue";
import { t } from "@/lib/i18n";
import type { Task } from "@/types/crm";

export default function TaskDetailScreen() {
  const router = useRouter();
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
        Alert.alert(t("common.done"), "Дію додано в офлайн-чергу.");
        router.back();
      } else {
        Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading || !task) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12 }}>{t("common.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <TaskRow task={task} onComplete={() => void onComplete()} busy={busy} />
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}>
        <Text style={styles.backBtnText}>{t("common.back") ?? t("common.cancel")}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scroll: { padding: 16, paddingBottom: 32 },
  backBtn: { marginTop: 10, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { color: "#2563eb", fontWeight: "600" },
});

