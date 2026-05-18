import { Text, View } from "@/components/Themed";

export default function ClientsScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Клиенты</Text>
      <Text style={{ lineHeight: 22, opacity: 0.85 }}>
        Экран поиска контактов/компаний появится в следующей итерации через существующие API CRM.
      </Text>
    </View>
  );
}
