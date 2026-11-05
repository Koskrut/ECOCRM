export type TelegramWebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { user?: TelegramWebAppUser };
  ready: () => void;
  expand: () => void;
  close: () => void;
  /** Keep the Mini App chrome on the store palette; Telegram dark theme is ignored. */
  setBackgroundColor?: (color: string) => void;
  setHeaderColor?: (color: string) => void;
  themeParams?: Record<string, string>;
  platform?: string;
  MainButton?: {
    text: string;
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    setText: (text: string) => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    /** Set by the inline head script before telegram-web-app.js can drop the hash. */
    __SUPREX_TG_INIT_DATA?: string;
    /** Signed catalog handoff (`tgAuth`) captured before the Mini App rewrites the URL. */
    __SUPREX_TG_AUTH?: string;
  }
}

/** `tgWebAppData` from the Mini App URL hash or query. */
export function parseTgWebAppData(source: string): string {
  if (!source) return "";
  const match = source.match(/(?:^|[?#&])tgWebAppData=([^&]*)/);
  if (!match?.[1]) return "";
  try {
    return decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
  } catch {
    return "";
  }
}

/** Survives a Mini App URL rewrite that drops `?tgAuth` before React boots. */
export const CATALOG_AUTH_STORAGE_KEY = "suprex_tg_auth";
/** Same for initData — Desktop Telegram may wipe the hash before React reads it. */
export const TG_INIT_DATA_STORAGE_KEY = "suprex_tg_init_data";

export function persistTelegramInitData(initData: string): void {
  const value = initData.trim();
  if (!value || typeof window === "undefined") return;
  window.__SUPREX_TG_INIT_DATA = value;
  try {
    sessionStorage.setItem(TG_INIT_DATA_STORAGE_KEY, value);
  } catch {
    /* WebView may block storage */
  }
}

/** URL of the first document load. Next.js replaceState drops the Telegram hash; this entry keeps it. */
function readPerformanceLaunchUrl(): string {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return nav?.name ?? "";
  } catch {
    return "";
  }
}

/** Official telegram-web-app.js stores launch params here, including tgWebAppData. */
function readTelegramSdkInitData(): string {
  try {
    const raw = sessionStorage.getItem("__telegram__initParams");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { tgWebAppData?: unknown };
    return typeof parsed.tgWebAppData === "string" ? parsed.tgWebAppData.trim() : "";
  } catch {
    return "";
  }
}

export function readCapturedTelegramInitData(): string {
  if (typeof window === "undefined") return "";
  const snap = window.__SUPREX_TG_INIT_DATA?.trim() ?? "";
  if (snap) return snap;
  const fromUrl =
    parseTgWebAppData(window.location.hash) ||
    parseTgWebAppData(window.location.search) ||
    parseTgWebAppData(window.location.href) ||
    parseTgWebAppData(readPerformanceLaunchUrl());
  if (fromUrl) {
    persistTelegramInitData(fromUrl);
    return fromUrl;
  }
  const fromSdk = readTelegramSdkInitData();
  if (fromSdk) {
    persistTelegramInitData(fromSdk);
    return fromSdk;
  }
  try {
    return sessionStorage.getItem(TG_INIT_DATA_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** Phone handoff the bot puts on the catalog button. Empty outside that open. */
function readTgAuthFromHref(href: string): string {
  try {
    const q = href.indexOf("?");
    const h = href.indexOf("#");
    const query = q >= 0 ? href.slice(q + 1, h >= 0 && h > q ? h : undefined) : "";
    const fromQuery = new URLSearchParams(query).get("tgAuth")?.trim() ?? "";
    if (fromQuery) return fromQuery;
    if (h >= 0) {
      return new URLSearchParams(href.slice(h + 1).replace(/^#/, "")).get("tgAuth")?.trim() ?? "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function readCatalogAuthToken(): string {
  if (typeof window === "undefined") return "";
  const snap = window.__SUPREX_TG_AUTH?.trim() ?? "";
  if (snap) return snap;
  const fromUrl =
    readTgAuthFromHref(window.location.href) || readTgAuthFromHref(readPerformanceLaunchUrl());
  if (fromUrl) {
    window.__SUPREX_TG_AUTH = fromUrl;
    try {
      sessionStorage.setItem(CATALOG_AUTH_STORAGE_KEY, fromUrl);
    } catch {
      /* WebView may block storage */
    }
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(CATALOG_AUTH_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

/** This document was opened from the bot catalog button (query or Telegram hash). */
export function hasTelegramLaunchHint(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__SUPREX_TG_AUTH?.trim()) return true;
  try {
    if (new URLSearchParams(window.location.search).get("tgAuth")?.trim()) return true;
  } catch {
    /* ignore */
  }
  const src = `${window.location.href}&${readPerformanceLaunchUrl()}`;
  return /(?:^|[?#&])tgWebApp(?:Data|Platform|Version)=/.test(src);
}

/** telegram-web-app.js sets `unknown` on a normal browser tab. */
export function isEmbeddedTelegramPlatform(platform: string | undefined): boolean {
  return Boolean(platform && platform !== "unknown");
}

export function resolveTelegramInitData(app?: TelegramWebApp | null): string {
  const live = app?.initData?.trim() || getTelegramInitData();
  if (live) {
    persistTelegramInitData(live);
    return live;
  }
  return readCapturedTelegramInitData();
}

export function isTelegramUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Telegram/i.test(navigator.userAgent);
}

/** True when Telegram injected the WebApp bridge (initData may still be empty briefly). */
export function hasTelegramWebAppBridge(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Telegram?.WebApp);
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function getTelegramInitData(): string {
  const app = getTelegramWebApp();
  return app?.initData?.trim() || readCapturedTelegramInitData();
}

/** Script loads outside Telegram too — only initData (or unsafe user) means a real Mini App. */
export function isRealTelegramMiniApp(app: TelegramWebApp | null | undefined): boolean {
  if (!app) return false;
  if (app.initData?.trim()) return true;
  return Boolean(app.initDataUnsafe?.user?.id);
}

/**
 * Wait until telegram-web-app.js is present and initData is filled.
 * Catalog web_app opens can race React hydration vs the Telegram bridge.
 * Returns null for a normal browser tab (script stub without initData).
 */
export async function waitForTelegramWebApp(opts?: {
  timeoutMs?: number;
}): Promise<TelegramWebApp | null> {
  if (typeof window === "undefined") return null;
  const started = Date.now();
  const launchHint =
    isTelegramUserAgent() || Boolean(readCapturedTelegramInitData()) || hasTelegramLaunchHint();
  let timeoutMs = launchHint ? (opts?.timeoutMs ?? 8_000) : 800;

  while (Date.now() - started < timeoutMs) {
    const app = window.Telegram?.WebApp;
    if (isEmbeddedTelegramPlatform(app?.platform)) {
      timeoutMs = Math.max(timeoutMs, opts?.timeoutMs ?? 8_000);
    }
    if (app) {
      try {
        app.ready?.();
      } catch {
        /* ignore */
      }
      if (isRealTelegramMiniApp(app) || readCapturedTelegramInitData()) return app;
    } else if (readCapturedTelegramInitData()) {
      return {
        initData: readCapturedTelegramInitData(),
        ready: () => undefined,
        expand: () => undefined,
        close: () => undefined,
      };
    }
    await new Promise((r) => setTimeout(r, 50));
  }

  const captured = readCapturedTelegramInitData();
  if (captured) {
    return (
      window.Telegram?.WebApp ?? {
        initData: captured,
        ready: () => undefined,
        expand: () => undefined,
        close: () => undefined,
      }
    );
  }
  const app = window.Telegram?.WebApp ?? null;
  // Catalog opens with ?tgAuth= before initData arrives — keep the bridge so the
  // caller can poll instead of treating the tab as a normal browser.
  if (app && (launchHint || isEmbeddedTelegramPlatform(app.platform))) return app;
  return isRealTelegramMiniApp(app) ? app : null;
}

export function isTelegramMiniApp(): boolean {
  return isRealTelegramMiniApp(getTelegramWebApp());
}
