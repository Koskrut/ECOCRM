import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { TextField } from "@/components/ui/TextField";
import { useServerConfig } from "@/context/server-config-context";
import { normalizeApiBaseUrl } from "@/lib/config";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

function probeErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (e.name === "AbortError" || /abort/i.test(e.message)) {
      return t("serverSetup.timeout");
    }
    if (e.message === "empty" || e.message === "invalid") {
      return t("serverSetup.validation");
    }
    if (/Failed to fetch|Network request failed|network/i.test(e.message)) {
      return t("serverSetup.unreachable");
    }
    if (/^HTTP \d+/.test(e.message)) {
      return t("serverSetup.notCrm");
    }
  }
  return t("serverSetup.unreachable");
}

export default function ServerSetupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { apiUrl, setServerUrl } = useServerConfig();
  const params = useLocalSearchParams<{ prefill?: string }>();

  const initial = useMemo(() => {
    if (typeof params.prefill === "string" && params.prefill.trim()) {
      return params.prefill.trim();
    }
    return apiUrl ?? "";
  }, [params.prefill, apiUrl]);

  const [urlField, setUrlField] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setUrlField(initial);
  }, [initial]);

  async function onSubmit() {
    setError(null);
    let normalized: string;
    try {
      normalized = normalizeApiBaseUrl(urlField);
    } catch {
      setError(t("serverSetup.validation"));
      return;
    }
    setLoading(true);
    try {
      await setServerUrl(normalized);
      router.replace("/login");
    } catch (e) {
      setError(probeErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.bg }]}>
      <LinearGradient
        colors={[theme.colors.primaryMuted, "transparent", theme.colors.bg]}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
      <SafeAreaView style={styles.safe}>
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Text style={[theme.typography.display, styles.brand]}>{t("serverSetup.brand")}</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t("serverSetup.hint")}
            </Text>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                ...theme.elevation.md,
              },
            ]}>
            <Text style={theme.typography.title}>{t("serverSetup.title")}</Text>

            <TextField
              value={urlField}
              onChangeText={setUrlField}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={t("serverSetup.placeholder")}
              editable={!loading}
              label={t("serverSetup.urlLabel")}
              onSubmitEditing={onSubmit}
              error={error}
            />

            <AppButton
              label={t("serverSetup.submit")}
              onPress={onSubmit}
              loading={loading}
              disabled={loading}
              fullWidth
              style={{ marginTop: 8 }}
            />
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 360,
  },
  safe: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  hero: { marginBottom: 28, gap: 8 },
  brand: {},
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
    gap: 4,
  },
});
