import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from "react-native";

import { Text } from "@/components/Themed";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";

type Profile = {
  fuelLitersPer100km: number;
  fuelPricePerLiter: string | number | null;
  vehicleLabel: string | null;
  usePersonalCar: boolean;
};

export default function FuelProfileScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [vehicle, setVehicle] = useState("");
  const [liters, setLiters] = useState("8");
  const [price, setPrice] = useState("");
  const [personal, setPersonal] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiFetch<{ profile: Profile }>("/field/profile", { token });
      setVehicle(r.profile.vehicleLabel ?? "");
      setLiters(String(r.profile.fuelLitersPer100km));
      setPrice(
        r.profile.fuelPricePerLiter != null ? String(r.profile.fuelPricePerLiter) : "",
      );
      setPersonal(r.profile.usePersonalCar);
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch("/field/profile", {
        method: "PATCH",
        token,
        body: JSON.stringify({
          vehicleLabel: vehicle.trim() || null,
          fuelLitersPer100km: Number(liters.replace(",", ".")),
          fuelPricePerLiter: price.trim() ? Number(price.replace(",", ".")) : null,
          usePersonalCar: personal,
        }),
      });
      router.back();
    } catch (e) {
      Alert.alert("Ошибка", String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.label}>Авто</Text>
      <TextInput value={vehicle} onChangeText={setVehicle} style={styles.input} />

      <Text style={styles.label}>л/100 км</Text>
      <TextInput value={liters} onChangeText={setLiters} keyboardType="decimal-pad" style={styles.input} />

      <Text style={styles.label}>Цена, грн/л</Text>
      <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={styles.input} />

      <View style={styles.row}>
        <Text>Личное авто</Text>
        <Switch value={personal} onValueChange={setPersonal} />
      </View>

      <Pressable style={[styles.btn, saving && { opacity: 0.5 }]} disabled={saving} onPress={() => void save()}>
        <Text style={styles.btnTxt}>Сохранить</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  label: { fontSize: 13, opacity: 0.8, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#bbb",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginTop: 4,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 16 },
  btn: { backgroundColor: "#2563eb", padding: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  btnTxt: { color: "#fff", fontWeight: "600" },
});
