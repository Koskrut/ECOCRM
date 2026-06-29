import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

type Profile = {
  fuelLitersPer100km: number;
  fuelPricePerLiter: string | number | null;
  vehicleLabel: string | null;
  usePersonalCar: boolean;
};

export default function FuelProfileScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const theme = useTheme();
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
      Alert.alert(t("common.error"), String(e));
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
      Alert.alert(t("common.error"), String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAwareScrollView>
        <AppHeader title={t("fuel.profile")} />

        <TextField label={t("fuel.vehicle")} value={vehicle} onChangeText={setVehicle} />
        <TextField
          label={t("fuel.litersLabel")}
          value={liters}
          onChangeText={setLiters}
          keyboardType="decimal-pad"
        />
        <TextField
          label={t("fuel.priceLabel")}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />

        <View style={[styles.row, { marginVertical: theme.spacing.md }]}>
          <Text style={theme.typography.body}>{t("fuel.personalCar")}</Text>
          <Switch
            value={personal}
            onValueChange={setPersonal}
            trackColor={{ false: theme.colors.chip, true: theme.colors.primaryMuted }}
            thumbColor={personal ? theme.colors.primary : theme.colors.textMuted}
          />
        </View>

        <AppButton
          label={t("common.save")}
          onPress={() => void save()}
          disabled={saving}
          loading={saving}
        />
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
