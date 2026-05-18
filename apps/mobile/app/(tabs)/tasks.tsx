import { Text, View } from "@/components/Themed";

export default function TasksScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Задачи</Text>
      <Text style={{ lineHeight: 22, opacity: 0.85 }}>
        Интеграция с модулем задач NestJS (`TasksModule`) можно подключить отдельно.
      </Text>
    </View>
  );
}
