import { Text, View } from "@/components/Themed";

/** Заготовка трека точек из визитов дня без react-native-maps (MVP). */
export default function MapScreen() {
  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Карта</Text>
      <Text style={{ lineHeight: 22, opacity: 0.85 }}>
        В первой версии список визитов с адресами — на вкладке «Сегодня». Подключение карты и
        маркеров можно добавить отдельно (react-native-maps).
      </Text>
    </View>
  );
}
