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
  hasTelegramLaunchHint,
  isEmbeddedTelegramPlatform,
  isTelegramUserAgent,
  readCatalogAuthToken,
  resolveTelegramInitData,
  waitForTelegramWebApp,
} from "@/lib/telegram-webapp";
import {
  clearTelegramStoreSession,
  getTelegramCabinetToken,
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
  const tgAuth = readCatalogAuthToken();
  const res = await fetch("/api/auth/store-telegram-session", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tgAuth ? { initData, tgAuth } : { initData }),
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
    region?: string | null;
    contactId: string | null;
    customerId: string | null;
    loggedIn: boolean;
  }>;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const exchangedRef = useRef(false);

  const applySession = useCallback(
    (session: Awaited<ReturnType<typeof exchangeInitData>>) => {
      setTelegramStoreSession({
        token: session.token,
        cartSessionId: session.cartSessionId,
        phone: session.phone,
        firstName: session.firstName,
        lastName: session.lastName,
        region: session.region ?? null,
        contactId: session.contactId,
        storeToken: session.storeToken ?? (session.loggedIn || session.contactId ? undefined : null),
      });
      setToken(session.token);
      setCartSessionId(session.cartSessionId);
      setProfile({
        phone: session.phone,
        firstName: session.firstName,
        lastName: session.lastName,
        region: session.region ?? null,
        contactId: session.contactId,
      });
      const nextLoggedIn = Boolean(session.loggedIn || session.contactId);
      loggedInRef.current = nextLoggedIn;
      exchangedRef.current = true;
      setLoggedIn(nextLoggedIn);
      setError(null);
    },
    [],
  );

  const restoreSavedSession = useCallback(() => {
    const savedProfile = getTelegramStoreProfile();
    const savedToken = getTelegramStoreToken();
    const cabinetToken = getTelegramCabinetToken();
    if (!savedToken && !cabinetToken) return false;
    // contactId is stored only after a finished profile, so checkout can show it
    // before the next initData exchange returns.
    const keepLogin = Boolean(savedProfile?.contactId);
    setToken(savedToken);
    setCartSessionId(getTelegramCartSessionId());
    setProfile(savedProfile);
    loggedInRef.current = keepLogin;
    setLoggedIn(keepLogin);
    return true;
  }, []);

  const refreshSession = useCallback(async () => {
    const initData = resolveTelegramInitData();
    if (!initData) return false;
    try {
      const session = await exchangeInitData(initData);
      applySession(session);
      return Boolean(session.loggedIn || session.contactId);
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
      // Cart and checkout render now. Session exchange continues behind them.
      const restored = restoreSavedSession();
      setReady(true);
      if (!restored) setLoading(true);
      // Catalog web_app can hydrate before telegram-web-app.js copies tgWebAppData.
      // A signed ?tgAuth= URL is still a Mini App open even when the UA looks like Safari.
      const app = await waitForTelegramWebApp({ timeoutMs: restored ? 1_500 : 2_500 });
      if (cancelled) return;
      let initData = resolveTelegramInitData(app);
      const inTelegram =
        Boolean(initData) ||
        isTelegramUserAgent() ||
        isEmbeddedTelegramPlatform(app?.platform) ||
        hasTelegramLaunchHint() ||
        Boolean(app);

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

      // Desktop / some WebViews inject initData after ?tgAuth paints the catalog.
      // Keep this short when a cart token is already on screen.
      if (!initData) {
        const started = Date.now();
        const budget = restored ? 1_500 : 3_000;
        while (!cancelled && Date.now() - started < budget) {
          await sleep(200);
          initData = resolveTelegramInitData(getTelegramWebApp());
          if (initData) break;
        }
      }

      if (!initData) {
        const kept = restoreSavedSession();
        if (!kept) {
          setError(
            "Telegram не передав сесію. Закрийте вітрину і знову натисніть «Каталог» у боті.",
          );
        }
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
        const kept = restoreSavedSession();
        if (!kept) {
          setError(err instanceof Error ? err.message : "Не вдалося увійти через Telegram");
        }
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
  }, [applySession, restoreSavedSession]);

  // Keep polling after boot when Telegram opened via tgAuth but initData arrived late.
  useEffect(() => {
    if (!ready || !isTelegram) return;
    if (exchangedRef.current && loggedInRef.current) return;

    let stopped = false;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (stopped) return;
      if (exchangedRef.current && loggedInRef.current) {
        window.clearInterval(timer);
        return;
      }
      const initData = resolveTelegramInitData(getTelegramWebApp());
      if (!initData) {
        if (Date.now() - started > 20_000) window.clearInterval(timer);
        return;
      }
      window.clearInterval(timer);
      void exchangeInitData(initData)
        .then((session) => {
          if (!stopped) applySession(session);
        })
        .catch((err: unknown) => {
          if (stopped || loggedInRef.current) return;
          setError(err instanceof Error ? err.message : "Не вдалося увійти через Telegram");
        });
    }, 250);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [ready, isTelegram, error, loggedIn, applySession]);

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
