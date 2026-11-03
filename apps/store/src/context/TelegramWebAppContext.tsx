"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getTelegramWebApp,
  isTelegramUserAgent,
  resolveTelegramInitData,
  waitForTelegramWebApp,
} from "@/lib/telegram-webapp";
import {
  clearTelegramStoreSession,
  getTelegramCartSessionId,
  getTelegramStoreProfile,
  getTelegramStoreToken,
  setTelegramStoreSession,
  type TelegramStoreProfile,
} from "@/lib/telegram-session";

type TelegramWebAppContextValue = {
  ready: boolean;
  isTelegram: boolean;
  loading: boolean;
  error: string | null;
  token: string;
  cartSessionId: string;
  profile: TelegramStoreProfile | null;
  loggedIn: boolean;
  /** Re-exchange initData (e.g. after bot onboarding). */
  refreshSession: () => Promise<boolean>;
  close: () => void;
};

const TelegramWebAppContext = createContext<TelegramWebAppContextValue>({
  ready: false,
  isTelegram: false,
  loading: false,
  error: null,
  token: "",
  cartSessionId: "",
  profile: null,
  loggedIn: false,
  refreshSession: async () => false,
  close: () => {},
});

export function useTelegramWebApp() {
  return useContext(TelegramWebAppContext);
}

async function exchangeInitData(initData: string) {
  const res = await fetch("/api/auth/store-telegram-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((err as { message?: string }).message ?? "Telegram session failed");
  }
  return res.json() as Promise<{
    token: string;
    storeToken?: string | null;
    cartSessionId: string;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    contactId: string | null;
    customerId: string | null;
    loggedIn: boolean;
  }>;
}

export function TelegramWebAppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [cartSessionId, setCartSessionId] = useState("");
  const [profile, setProfile] = useState<TelegramStoreProfile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const loggedInRef = useRef(false);

  const applySession = useCallback(
    (session: Awaited<ReturnType<typeof exchangeInitData>>) => {
      setTelegramStoreSession({
        token: session.token,
        cartSessionId: session.cartSessionId,
        phone: session.phone,
        firstName: session.firstName,
        lastName: session.lastName,
        contactId: session.contactId,
        storeToken: session.storeToken ?? (session.loggedIn ? undefined : null),
      });
      setToken(session.token);
      setCartSessionId(session.cartSessionId);
      setProfile({
        phone: session.phone,
        firstName: session.firstName,
        lastName: session.lastName,
        contactId: session.contactId,
      });
      const nextLoggedIn = Boolean(session.loggedIn || session.contactId);
      loggedInRef.current = nextLoggedIn;
      setLoggedIn(nextLoggedIn);
      setError(null);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    const initData = resolveTelegramInitData();
    if (!initData) return false;
    try {
      const session = await exchangeInitData(initData);
      applySession(session);
      return Boolean(session.loggedIn);
    } catch {
      return false;
    }
  }, [applySession]);

  const close = useCallback(() => {
    getTelegramWebApp()?.close?.();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      setLoading(true);
      // Catalog web_app can hydrate before telegram-web-app.js copies tgWebAppData.
      const app = await waitForTelegramWebApp({ timeoutMs: 8_000 });
      if (cancelled) return;
      const initData = resolveTelegramInitData(app);
      const inTelegram = Boolean(initData) || isTelegramUserAgent() || Boolean(app);

      if (!inTelegram) {
        clearTelegramStoreSession();
        setIsTelegram(false);
        setLoading(false);
        setReady(true);
        return;
      }

      setIsTelegram(true);
      try {
        app?.ready();
        app?.expand();
      } catch {
        /* ignore */
      }

      const theme = app?.themeParams ?? {};
      if (theme.bg_color) {
        document.documentElement.style.setProperty("--tg-bg", theme.bg_color);
      }
      if (theme.button_color) {
        document.documentElement.style.setProperty("--primary", theme.button_color);
      }

      if (!initData) {
        setError("Telegram не передав сесію. Закрийте вітрину і знову натисніть «Каталог» у боті.");
        setLoading(false);
        setReady(true);
        return;
      }

      try {
        const session = await exchangeInitData(initData);
        if (cancelled) return;
        applySession(session);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Не вдалося увійти через Telegram");
        setToken(getTelegramStoreToken());
        setCartSessionId(getTelegramCartSessionId());
        setProfile(getTelegramStoreProfile());
        loggedInRef.current = false;
        setLoggedIn(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setReady(true);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  // After bot onboarding, Telegram may reopen/focus the Mini App — refresh CRM login.
  useEffect(() => {
    if (!isTelegram || !ready) return;

    const refreshIfNeeded = () => {
      if (loggedInRef.current) return;
      if (document.visibilityState && document.visibilityState !== "visible") return;
      void refreshSession();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };

    window.addEventListener("focus", refreshIfNeeded);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(refreshIfNeeded, 15_000);

    return () => {
      window.removeEventListener("focus", refreshIfNeeded);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [isTelegram, ready, refreshSession]);

  const value = useMemo(
    () => ({
      ready,
      isTelegram,
      loading,
      error,
      token,
      cartSessionId,
      profile,
      loggedIn,
      refreshSession,
      close,
    }),
    [
      ready,
      isTelegram,
      loading,
      error,
      token,
      cartSessionId,
      profile,
      loggedIn,
      refreshSession,
      close,
    ],
  );

  return (
    <TelegramWebAppContext.Provider value={value}>{children}</TelegramWebAppContext.Provider>
  );
}
