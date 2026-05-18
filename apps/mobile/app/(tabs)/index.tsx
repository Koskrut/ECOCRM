import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { formatLocalDateKey } from "@/lib/date";
import type { VisitSummary } from "@/types/crm";

function visitLabel(v: VisitSummary): string {
  if (v.title?.trim()) return v.title.trim();
  if (v.contact) {
    return [v.contact.firstName, v.contact.lastName].filter(Boolean).join(" ");
  }
  if (v.company?.name) return v.company.name;
  return "Визит";
}

function timeRange(v: VisitSummary): string {
  if (!v.startsAt) return "";
  const start = new Date(v.startsAt);
  const h = start.getHours();
  const m = String(start.getMinutes()).padStart(2, "0");
  if (v.endsAt) {
    const end = new Date(v.endsAt);
    const eh = end.getHours();
    const em = String(end.getMinutes()).padStart(2, "0");
    return `${h}:${m}–${eh}:${em}`;
  }
  return `${h}:${m}`;
}

export default function TodayScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftInfo, setShiftInfo] = useState<string | null>(null);

  const dateKey = formatLocalDateKey();

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [day, active] = await Promise.all([
        apiFetch<{ items: VisitSummary[] }>(`/visits/day?date=${encodeURIComponent(dateKey)}`, {
          token,
        }),
        apiFetch<{ shift: { id: string; status: string } | null }>("/field/shifts/active", { token }).catch(() => ({
          shift: null,
        })),
      ]);
      setItems(day.items ?? []);
      if (active.shift) {
        setShiftInfo(`Смена активна (${active.shift.status})`);
      } else {
        setShiftInfo(null);
      }
    } finally {
      setLoading(false);
    }
  }, [token, dateKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Сегодня</Text>
      <Text style={styles.dateLine}>
        {dateKey}
        {shiftInfo ? ` · ${shiftInfo}` : ""}
      </Text>

      <FlatList
        data={items}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading ? "Загрузка…" : "Нет визитов на этот день. Добавьте их в веб-CRM."}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/visit/${item.id}`)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.72 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.visitTitle}>{visitLabel(item)}</Text>
              <Text style={styles.visitMeta}>
                {timeRange(item)} · {item.status}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />

      <Text style={styles.footerHint}>
        Смену и топливо откройте во вкладке «Ещё».
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heading: {
    fontSize: 26,
    fontWeight: "700",
  },
  dateLine: {
    marginTop: 4,
    marginBottom: 12,
    opacity: 0.75,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(120,120,128,0.08)",
    marginBottom: 8,
  },
  visitTitle: {
    fontWeight: "600",
    fontSize: 17,
  },
  visitMeta: {
    opacity: 0.7,
    marginTop: 4,
    fontSize: 14,
  },
  chev: {
    fontSize: 24,
    opacity: 0.4,
    marginLeft: 8,
  },
  empty: {
    marginTop: 32,
    textAlign: "center",
    opacity: 0.7,
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  footerHint: {
    fontSize: 12,
    opacity: 0.55,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
});
