import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiFetch } from "@/lib/api";
import type { AuthUserBrief, LoginResponse } from "@/types/crm";

const TOKEN_KEY = "crm_manager_jwt";

type AuthCtx = {
  ready: boolean;
  token: string | null;
  user: AuthUserBrief | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUserBrief | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
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
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              setToken(null);
              setUser(null);
            }
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (loginStr: string, password: string) => {
    const data = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login: loginStr.trim(), password }),
      token: null,
    });
    await SecureStore.setItemAsync(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ ready, token, user, login, logout }),
    [ready, token, user, login, logout],
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
