import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/context/auth-context";
import { Text } from "@/components/Themed";
import { t } from "@/lib/i18n";

export default function LoginScreen() {
  const { login } = useAuth();
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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("login.title")}</Text>
          <Text style={styles.hint}>{t("login.hint")}</Text>

          <TextInput
            value={loginField}
            onChangeText={setLoginField}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={t("login.loginPlaceholder")}
            placeholderTextColor="#888"
            style={styles.input}
            editable={!loading}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t("login.passwordPlaceholder")}
            placeholderTextColor="#888"
            style={styles.input}
            editable={!loading}
            onSubmitEditing={onSubmit}
          />

          {error ? (
            <Text style={styles.error} lightColor="#c00">
              {error}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={loading}
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.button,
              { opacity: pressed || loading ? 0.65 : 1 },
            ]}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t("login.submit")}</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1, justifyContent: "center", paddingHorizontal: 24 },
  card: { gap: 12 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  hint: { opacity: 0.75, marginBottom: 12, fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: { fontSize: 14, marginTop: 4 },
  button: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
