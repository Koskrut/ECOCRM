import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text } from "@/components/Themed";
import { AppButton } from "@/components/ui/AppButton";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { TextField } from "@/components/ui/TextField";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/lib/design/theme-context";
import { t } from "@/lib/i18n";

export default function LoginScreen() {
  const { login } = useAuth();
  const theme = useTheme();
  const [loginField, setLoginField] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!loginField.trim() || !password) {
      setError(t("login.validation"));
      return;
    }
    setLoading(true);
    try {
      await login(loginField, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
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
            <Text style={[theme.typography.display, styles.brand]}>Suprex CRM</Text>
            <Text style={[theme.typography.caption, { color: theme.colors.textMuted }]}>
              {t("login.hint")}
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
            <Text style={theme.typography.title}>{t("login.title")}</Text>

            <TextField
              value={loginField}
              onChangeText={setLoginField}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t("login.loginPlaceholder")}
              editable={!loading}
              label={t("login.loginPlaceholder")}
            />
            <TextField
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder={t("login.passwordPlaceholder")}
              editable={!loading}
              label={t("login.passwordPlaceholder")}
              onSubmitEditing={onSubmit}
              error={error}
            />

            <AppButton
              label={t("login.submit")}
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
