import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Alert } from "react-native";

import { useServerConfig } from "@/context/server-config-context";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { flushPendingSamples } from "@/lib/location-tracking-buffer";
import { endPresenceSession } from "@/lib/presence-heartbeat";
import { getCachedPushToken, unregisterPushToken } from "@/lib/push-notifications";
import {
  clearFlushBlockReason,
  isAuthRequired,
  setAuthRequired,
  subscribeSessionAuth,
} from "@/lib/session-auth";
import type { AuthUserBrief, LoginResponse } from "@/types/crm";

const TOKEN_KEY = "crm_manager_jwt";

type AuthCtx = {
  ready: boolean;
  token: string | null;
  user: AuthUserBrief | null;
  /** GPS flush hit 401 — show blocking re-login (buffer kept). */
  sessionExpired: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { ready: serverReady, apiUrl } = useServerConfig();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserBrief | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const sync = () => {
      const required = isAuthRequired();
      setSessionExpired(required);
      if (required) {
        setToken(null);
        setUser(null);
      }
    };
    sync();
    return subscribeSessionAuth(sync);
  }, []);

  useEffect(() => {
    if (!serverReady) return;

    let cancelled = false;
    void (async () => {
      setReady(false);
      try {
        if (!apiUrl) {
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
          return;
        }

        const t = await SecureStore.getItemAsync(TOKEN_KEY);
        const tok = !cancelled && t && t.length > 0 ? t : null;
        if (cancelled) return;
        setToken(tok);
        if (tok) {
          try {
            const me = await apiFetch<{ user: AuthUserBrief & Record<string, unknown> }>("/auth/me", {
              token: tok,
            });
            if (!cancelled) {
              setUser({
                id: String(me.user.id),
                email: String(me.user.email),
                fullName: String(me.user.fullName),
                role: String(me.user.role),
              });
            }
          } catch {
            if (!cancelled) {
              try {
                await SecureStore.deleteItemAsync(TOKEN_KEY);
              } catch {
                /* ignore keystore errors */
              }
              // Expired JWT on cold start with buffered GPS → same path as flush 401.
              try {
                const AsyncStorage = (await import("@react-native-async-storage/async-storage"))
                  .default;
                const pendingRaw = await AsyncStorage.getItem("field_location_pending_samples");
                const hasPending =
                  !!pendingRaw && pendingRaw !== "[]" && pendingRaw.length > 2;
                if (hasPending) {
                  setAuthRequired(true, "auth_401");
                  setSessionExpired(true);
                }
              } catch {
                /* ignore */
              }
              setToken(null);
              setUser(null);
            }
          }
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serverReady, apiUrl]);

  const login = useCallback(async (loginStr: string, password: string) => {
    const data = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: loginStr.trim(), password }),
      token: null,
    });
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    } catch {
      throw new Error("Не вдалося зберегти сесію на пристрої");
    }
    setAuthRequired(false, null);
    setSessionExpired(false);
    clearFlushBlockReason();
    setToken(data.token);
    setUser(data.user);
    // Грибовская: after re-login, flush preserved GPS buffer (+ offline GPS jobs).
    void (async () => {
      try {
        const n = await flushPendingSamples();
        try {
          const { flushOfflineJobs } = await import("@/lib/offline-queue");
          await flushOfflineJobs({ token: data.token });
        } catch {
          /* optional */
        }
        if (n > 0) {
          Alert.alert(t("common.done"), t("gps.flushAfterLogin", { count: n }));
        }
      } catch {
        /* retry via watchdog / next flush */
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    const pushToken = getCachedPushToken();
    // Flush GPS while JWT still valid — token-null path cannot upload.
    if (token) {
      try {
        await flushPendingSamples();
      } catch {
        /* best-effort */
      }
      try {
        const { purgePendingSamples } = await import("@/lib/location-tracking-buffer");
        await purgePendingSamples();
      } catch {
        /* best-effort */
      }
      try {
        await unregisterPushToken(token, pushToken);
      } catch {
        /* proceed with logout */
      }
      try {
        await endPresenceSession(token);
      } catch {
        /* proceed with logout */
      }
    } else {
      await unregisterPushToken(null, pushToken);
    }
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      /* clear local session even if keystore fails */
    }
    setAuthRequired(false, null);
    setSessionExpired(false);
    setToken(null);
    setUser(null);
  }, [token]);

  const value = useMemo<AuthCtx>(
    () => ({ ready, token, user, sessionExpired, login, logout }),
    [ready, token, user, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be inside AuthProvider");
  }
  return ctx;
}
