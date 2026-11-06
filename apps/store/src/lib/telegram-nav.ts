import { readCatalogAuthToken } from "@/lib/telegram-webapp";

const NAV_STACK_KEY = "suprex_tg_nav_stack";
const NAV_STACK_MAX = 24;

/** Mini App document (set by TelegramShell). */
export function isTelegramMiniAppDocument(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-tg-miniapp") === "1";
}

function readNavStack(): string[] {
  if (typeof window === "undefined") return [];
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const parsed = JSON.parse(storage.getItem(NAV_STACK_KEY) ?? "[]") as unknown;
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === "string");
    } catch {
      /* try the other store */
    }
  }
  return [];
}

function writeNavStack(stack: string[]): void {
  const json = JSON.stringify(stack.slice(-NAV_STACK_MAX));
  try {
    sessionStorage.setItem(NAV_STACK_KEY, json);
  } catch {
    /* WebView may block sessionStorage */
  }
  try {
    localStorage.setItem(NAV_STACK_KEY, json);
  } catch {
    /* WebView may block localStorage */
  }
}

/** Path without `tgAuth` — that token is reattached on every Mini App load. */
export function storePathKey(path?: string): string {
  if (typeof window === "undefined") return path ?? "";
  try {
    const url = new URL(path ?? window.location.href, window.location.origin);
    url.searchParams.delete("tgAuth");
    url.hash = "";
    return `${url.pathname}${url.search}`;
  } catch {
    return path ?? "";
  }
}

export function peekTelegramNavStack(): string[] {
  return readNavStack();
}

export function popTelegramNavPath(): string | null {
  const stack = readNavStack();
  const prev = stack.pop() ?? null;
  writeNavStack(stack);
  return prev;
}

function withCatalogAuth(path: string): string {
  if (typeof window === "undefined") return path;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin !== window.location.origin) return path;
    const token = readCatalogAuthToken();
    if (token && !url.searchParams.get("tgAuth")) url.searchParams.set("tgAuth", token);
    url.hash = "";
    return `${url.pathname}${url.search}`;
  } catch {
    return path;
  }
}

function pushCurrentPath(): void {
  const here = storePathKey();
  if (!here) return;
  const stack = readNavStack();
  if (stack[stack.length - 1] === here) return;
  stack.push(here);
  writeNavStack(stack);
}

/** Full load — Telegram Android crashes on Next.js history.pushState / replaceState.
 *  Keep `tgAuth` on the next URL so a WebView that drops storage still logs in. */
export function assignStorePath(path: string, opts?: { back?: boolean }): void {
  if (typeof window === "undefined") return;
  let next = path;
  try {
    const url = new URL(path, window.location.origin);
    if (url.origin === window.location.origin) {
      next = `${url.pathname}${url.search}`;
    }
  } catch {
    /* keep path */
  }
  if (!opts?.back && storePathKey() !== storePathKey(next)) pushCurrentPath();
  next = withCatalogAuth(next);
  try {
    window.location.assign(next);
  } catch {
    window.location.href = next;
  }
}

export function navigateStorePath(path: string, spaNavigate: (path: string) => void): void {
  if (isTelegramMiniAppDocument()) assignStorePath(path);
  else spaNavigate(path);
}

export function isTelegramInternalHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("mailto:") || value.startsWith("tel:")) {
    return false;
  }
  if (value.startsWith("/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function openStoreExternalUrl(url: string): void {
  if (typeof window === "undefined") return;
  try {
    const app = window.Telegram?.WebApp;
    if (app && typeof app.openLink === "function") {
      app.openLink(url);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    window.location.assign(url);
  } catch {
    window.location.href = url;
  }
}
