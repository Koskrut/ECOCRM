import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card } from "@/components/ui/Card";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { Screen } from "@/components/ui/Screen";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/auth-context";
import { apiFetch, apiUploadForm } from "@/lib/api";
import { refuelReceiptUrl, type FuelRefuelEntry, type FuelRefuelTotals } from "@/lib/fuel-refuels";
import { useTheme } from "@/lib/design/theme-context";
import { gpsVerificationLabel } from "@/lib/labels";
import { t } from "@/lib/i18n";

type BreakdownRow = {
  id: string;
  title: string | null;
  completedAt: string | null;
  hasCoordinates: boolean;
  startGpsVerification: string | null;
  completeGpsVerification: string | null;
  includedInRoute: boolean;
};

type RouteMetrics = {
  distanceKm: number | null;
  source: string;
};

type FuelDayResponse = {
  report: {
    plannedKm: number | null;
    actualKm: number | null;
    compensationKm: number | null;
    litersEstimated: number | null;
    amountEstimated: string | number | null;
    compensationStatus: string;
    managerNote: string | null;
    metricsSource?: string | null;
    calculationSnapshot?: {
      payoutConfirmedStopCount?: number;
      payoutPlanStopCount?: number;
    } | null;
  };
  breakdown: BreakdownRow[];
  warnings: string[];
  factMetrics: RouteMetrics;
  factGpsMetrics?: RouteMetrics;
  factVisitsMetrics?: RouteMetrics;
  compensationFactKind?: "planned" | "fact_gps" | "fact_visits" | "none";
  refuels?: FuelRefuelEntry[];
  refuelTotals?: FuelRefuelTotals;
};

function RefuelReceiptThumb({ id, token }: { id: string; token: string | null }) {
  if (!token) return null;
  return (
    <Image
      source={{
        uri: refuelReceiptUrl(id),
        headers: { Authorization: `Bearer ${token}` },
      }}
      style={styles.receiptThumb}
      resizeMode="cover"
    />
  );
}

export default function FuelDayScreen() {
  const raw = useLocalSearchParams<{ date?: string | string[] }>().date;
  const date =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : formatFallback();
  const { token } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [data, setData] = useState<FuelDayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [refuelOpen, setRefuelOpen] = useState(false);
  const [refuelLiters, setRefuelLiters] = useState("");
  const [refuelAmount, setRefuelAmount] = useState("");
  const [refuelPhoto, setRefuelPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [updateProfilePrice, setUpdateProfilePrice] = useState(false);

  function formatFallback(): string {
    return new Date().toISOString().slice(0, 10);
  }

  const reload = useCallback(async () => {
    if (!token || !date) return;
    setLoading(true);
    try {
      const r = await apiFetch<FuelDayResponse>(
        `/field/fuel/day?date=${encodeURIComponent(date)}`,
        { token },
      );
      setData(r);
      setNote(r.report.managerNote ?? "");
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setLoading(false);
    }
  }, [token, date]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const canManageRefuels =
    data?.report.compensationStatus != null && data.report.compensationStatus !== "PAID";

  const refuelLitersNum = Number(refuelLiters.replace(",", "."));
  const refuelAmountNum = Number(refuelAmount.replace(",", "."));
  const impliedPricePerLiter =
    Number.isFinite(refuelLitersNum) &&
    refuelLitersNum > 0 &&
    Number.isFinite(refuelAmountNum) &&
    refuelAmountNum > 0
      ? refuelAmountNum / refuelLitersNum
      : null;

  const canSubmitRefuel = useMemo(() => {
    return (
      Boolean(refuelPhoto) &&
      Number.isFinite(refuelLitersNum) &&
      refuelLitersNum > 0 &&
      Number.isFinite(refuelAmountNum) &&
      refuelAmountNum > 0
    );
  }, [refuelPhoto, refuelLitersNum, refuelAmountNum]);

  const pickPhoto = async (useCamera: boolean) => {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("common.error"), t("fuel.refuelPhotoDenied"));
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.5, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.5, allowsEditing: false });
    if (!result.canceled && result.assets[0]) {
      setRefuelPhoto(result.assets[0]);
    }
  };

  const submitRefuel = async () => {
    if (!token || !refuelPhoto || !canSubmitRefuel) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("liters", String(refuelLitersNum));
      form.append("amount", String(refuelAmountNum));
      const name = refuelPhoto.fileName ?? `receipt-${Date.now()}.jpg`;
      const type = refuelPhoto.mimeType ?? "image/jpeg";
      form.append("file", {
        uri: refuelPhoto.uri,
        name,
        type,
      } as unknown as Blob);
      await apiUploadForm<{ item: FuelRefuelEntry }>(
        `/field/fuel/refuels?date=${encodeURIComponent(date)}`,
        form,
        { token },
      );
      if (updateProfilePrice && impliedPricePerLiter != null) {
        await apiFetch("/field/profile", {
          method: "PATCH",
          token,
          body: JSON.stringify({
            fuelPricePerLiter: Math.round(impliedPricePerLiter * 100) / 100,
          }),
        });
      }
      setRefuelOpen(false);
      setRefuelLiters("");
      setRefuelAmount("");
      setRefuelPhoto(null);
      setUpdateProfilePrice(false);
      await reload();
      Alert.alert(t("common.done"), t("fuel.refuelSaved"));
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteRefuel = (id: string) => {
    Alert.alert(t("fuel.refuelDeleteTitle"), t("fuel.refuelDeleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void (async () => {
            if (!token) return;
            setBusy(true);
            try {
              await apiFetch(`/field/fuel/refuels/${id}`, { method: "DELETE", token });
              await reload();
            } catch (e) {
              Alert.alert(t("common.error"), String(e));
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const recalc = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/field/fuel/day/recalculate?date=${encodeURIComponent(date)}`, {
        method: "POST",
        token,
      });
      await reload();
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetch(`/field/fuel/day?date=${encodeURIComponent(date)}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          compensationStatus: "SUBMITTED",
          managerNote: note.trim() || null,
        }),
      });
      await reload();
      Alert.alert(t("common.done"), t("fuel.reportSubmitted"));
    } catch (e) {
      Alert.alert(t("common.error"), String(e));
    } finally {
      setBusy(false);
    }
  };

  const r = data?.report;

  return (
    <Screen contentStyle={styles.flex} edges={["left", "right"]}>
      <KeyboardAwareScrollView
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={theme.colors.primary} />
        }>
        <AppHeader title={date} subtitle={t("fuel.dayHint")} large={false} />

        {loading && !data ? <ActivityIndicator color={theme.colors.primary} /> : null}

        {r ? (
          <>
            <Text style={[theme.typography.section, { marginBottom: 4 }]}>{t("fuel.compensationBlock")}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 8 }]}>
              {t("fuel.compensationHint")}
            </Text>
            {(data?.warnings ?? []).includes("planned_km_implausibly_large") ? (
              <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginBottom: 8 }]}>
                {t("fuel.planHugeWarning")}
              </Text>
            ) : null}
            {(data?.warnings ?? []).includes("planned_km_vs_fact_outlier") ? (
              <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginBottom: 8 }]}>
                {t("fuel.planVsFactWarning")}
              </Text>
            ) : null}
            <View style={styles.cards}>
              <Card style={[styles.metricCard, { backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary }]}>
                <Text style={[theme.typography.label, { color: theme.colors.primaryText }]}>{t("fuel.payout")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4, color: theme.colors.primaryText }]}>
                  {r.compensationKm ?? "—"} {t("common.km")}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.primaryText, marginTop: 2 }]}>
                  {r.litersEstimated ?? "—"} л
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.primaryText, marginTop: 2 }]}>
                  {(() => {
                    if (data?.compensationFactKind === "planned") return t("fuel.payoutSourcePlan");
                    if (data?.compensationFactKind === "fact_gps") return t("fuel.payoutSourceGps");
                    if (data?.compensationFactKind === "none") return t("fuel.payoutSourceReview");
                    return t("fuel.payoutSourceVisits");
                  })()}
                  {r.metricsSource ? ` · ${r.metricsSource}` : ""}
                </Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.trackGps")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {data?.factGpsMetrics?.distanceKm ?? "—"} {t("common.km")}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {t("fuel.trackGpsRef")}
                  {data?.factGpsMetrics?.source && data.factGpsMetrics.source !== "none"
                    ? ` · ${data.factGpsMetrics.source}`
                    : ""}
                </Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.visitRoute")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {data?.factVisitsMetrics?.distanceKm ?? data?.factMetrics?.distanceKm ?? "—"}{" "}
                  {t("common.km")}
                </Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                  {t("fuel.visitRouteRef")}
                </Text>
              </Card>
              <Card style={styles.metricCard}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.plan")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {r.plannedKm ?? "—"} {t("common.km")}
                </Text>
                {r.plannedKm != null ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                    {t("fuel.plannedExpected", { km: r.plannedKm })}
                  </Text>
                ) : null}
                {(data?.warnings ?? []).some((w) => w.startsWith("planned_km_")) ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginTop: 2 }]}>
                    {t("fuel.planSuspect")}
                  </Text>
                ) : null}
              </Card>
              <Card style={[styles.metricCard, { backgroundColor: theme.colors.surface }]}>
                <Text style={[theme.typography.label, { color: theme.colors.textMuted }]}>{t("fuel.amount")}</Text>
                <Text style={[theme.typography.title, { marginTop: 4 }]}>
                  {r.amountEstimated != null
                    ? `${Number(r.amountEstimated)} ${t("common.currency")}`
                    : "—"}
                </Text>
                {r.amountEstimated == null && r.compensationKm != null ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginTop: 2 }]}>
                    {t("fuel.amountNeedPrice")}
                  </Text>
                ) : null}
              </Card>
            </View>

            <View style={styles.refuelHeader}>
              <View style={styles.flex}>
                <Text style={theme.typography.section}>{t("fuel.refuelsBlock")}</Text>
                <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                  {t("fuel.refuelsHint")}
                </Text>
                {data.refuelTotals ? (
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                    {t("fuel.refuelsTotals", {
                      count: data.refuelTotals.count,
                      liters: data.refuelTotals.liters,
                      amount: data.refuelTotals.amount,
                    })}
                  </Text>
                ) : null}
              </View>
              {canManageRefuels ? (
                <AppButton
                  label={t("fuel.refuelAction")}
                  onPress={() => setRefuelOpen(true)}
                />
              ) : null}
            </View>

            {(data.refuels ?? []).length === 0 ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginBottom: 12 }]}>
                {t("fuel.refuelsEmpty")}
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {(data.refuels ?? []).map((item) => (
                  <Card key={item.id} style={styles.refuelCard}>
                    <RefuelReceiptThumb id={item.id} token={token} />
                    <Text style={[theme.typography.bodyMedium, { marginTop: 8 }]}>
                      {item.liters} л · {item.amount} {t("common.currency")}
                    </Text>
                    {item.liters > 0 ? (
                      <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                        {t("fuel.impliedPrice", {
                          value: Math.round((item.amount / item.liters) * 100) / 100,
                        })}
                      </Text>
                    ) : null}
                    {canManageRefuels ? (
                      <Pressable onPress={() => deleteRefuel(item.id)} hitSlop={8}>
                        <Text style={[theme.typography.caption, { color: theme.colors.danger, marginTop: 4 }]}>
                          {t("common.delete")}
                        </Text>
                      </Pressable>
                    ) : null}
                  </Card>
                ))}
              </ScrollView>
            )}

            {(data?.warnings ?? []).includes("insufficient_completed_visits") ? (
              <Text style={[theme.typography.caption, { color: theme.colors.warningText, marginBottom: 12 }]}>
                {t("fuel.insufficientVisits")}
              </Text>
            ) : null}

            {r.compensationStatus === "DRAFT" ? (
              <>
                <TextField
                  value={note}
                  onChangeText={setNote}
                  placeholder={t("fuel.notePlaceholder")}
                  multiline
                  style={{ minHeight: 60 }}
                />
                <AppButton
                  label={t("fuel.submit")}
                  onPress={() => void submit()}
                  disabled={busy || r.compensationKm == null}
                  loading={busy}
                  style={{ marginBottom: theme.spacing.sm }}
                />
              </>
            ) : null}

            <AppButton
              label={t("fuel.recalculate")}
              onPress={() => void recalc()}
              disabled={busy}
              loading={busy}
              variant="secondary"
              style={{ marginBottom: theme.spacing.md }}
            />

            <Text style={[theme.typography.section, { marginBottom: theme.spacing.sm }]}>{t("fuel.routeFact")}</Text>
            {(data?.breakdown ?? []).map((v, i) => (
              <Card key={v.id} style={{ marginBottom: theme.spacing.sm }}>
                <View style={styles.visitRow}>
                  <Text style={[theme.typography.caption, { color: theme.colors.textMuted, width: 20 }]}>
                    {i + 1}.
                  </Text>
                  <View style={styles.flex}>
                    <Text style={theme.typography.bodyMedium}>{v.title || t("fuel.visitFallback")}</Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {!v.hasCoordinates ? t("fuel.noMapPoint") : ""}
                      {v.includedInRoute ? t("fuel.inPlan") : t("fuel.outOfPlan")}
                    </Text>
                    <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 2 }]}>
                      {gpsVerificationLabel(v.completeGpsVerification) ||
                        gpsVerificationLabel(v.startGpsVerification) ||
                        "GPS —"}
                    </Text>
                  </View>
                </View>
              </Card>
            ))}

            {data?.factMetrics.source ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
                {t("fuel.kmSource", { source: data.factMetrics.source })}
              </Text>
            ) : null}
          </>
        ) : null}

        <AppButton
          label={t("fuel.backToMonth")}
          onPress={() => router.back()}
          variant="ghost"
          style={{ marginTop: theme.spacing.lg, alignSelf: "flex-start" }}
        />
      </KeyboardAwareScrollView>

      <Modal visible={refuelOpen} animationType="slide" transparent onRequestClose={() => setRefuelOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={theme.typography.title}>{t("fuel.refuelAction")}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 4 }]}>
              {t("fuel.refuelPhotoRequired")}
            </Text>
            <TextField
              value={refuelLiters}
              onChangeText={setRefuelLiters}
              placeholder={t("fuel.refuelLiters")}
              keyboardType="decimal-pad"
              style={{ marginTop: 16 }}
            />
            <TextField
              value={refuelAmount}
              onChangeText={setRefuelAmount}
              placeholder={t("fuel.refuelAmount")}
              keyboardType="decimal-pad"
              style={{ marginTop: 8 }}
            />
            {impliedPricePerLiter != null ? (
              <Text style={[theme.typography.caption, { color: theme.colors.textMuted, marginTop: 8 }]}>
                {t("fuel.impliedPrice", {
                  value: Math.round(impliedPricePerLiter * 100) / 100,
                })}
              </Text>
            ) : null}
            <Pressable
              onPress={() => setUpdateProfilePrice((v) => !v)}
              disabled={impliedPricePerLiter == null}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 4,
                  backgroundColor: updateProfilePrice ? theme.colors.primary : "transparent",
                }}
              />
              <Text style={[theme.typography.caption, { color: theme.colors.text, flex: 1 }]}>
                {t("fuel.updateProfilePrice")}
              </Text>
            </Pressable>
            <View style={styles.refuelPhotoRow}>
              <AppButton label={t("fuel.refuelCamera")} onPress={() => void pickPhoto(true)} variant="secondary" />
              <AppButton label={t("fuel.refuelGallery")} onPress={() => void pickPhoto(false)} variant="secondary" />
            </View>
            {refuelPhoto ? (
              <Image source={{ uri: refuelPhoto.uri }} style={styles.refuelPreview} resizeMode="contain" />
            ) : null}
            <View style={styles.refuelActions}>
              <AppButton label={t("common.cancel")} onPress={() => setRefuelOpen(false)} variant="ghost" />
              <AppButton
                label={t("fuel.refuelSubmit")}
                onPress={() => void submitRefuel()}
                disabled={!canSubmitRefuel || busy}
                loading={busy}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  metricCard: { flex: 1, minWidth: 100 },
  visitRow: { flexDirection: "row", gap: 8 },
  refuelHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  refuelCard: { width: 140, marginRight: 8 },
  receiptThumb: { width: "100%", height: 80, borderRadius: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32 },
  refuelPhotoRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  refuelPreview: { width: "100%", height: 160, marginTop: 12, borderRadius: 8 },
  refuelActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
});
