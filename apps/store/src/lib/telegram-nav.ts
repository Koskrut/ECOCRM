const NAV_STACK_KEY = "suprex_tg_nav_stack";
const NAV_STACK_MAX = 24;

let spaNavigate: ((path: string) => void) | null = null;
let currentSpaPath = "";

/** Mini App document (set by TelegramShell). */
export function isTelegramMiniAppDocument(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-tg-miniapp") === "1";
}

export function isTelegramAndroid(): boolean {
  if (typeof window === "undefined") return false;
  const platform = window.Telegram?.WebApp?.platform;
  if (platform === "android") return true;
  return /Android/i.test(navigator.userAgent);
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

/** Path without `tgAuth` — login lives in storage, not on every Mini App URL. */
export function storePathKey(path?: string): string {
  if (typeof window === "undefined") return path ?? "";
  try {
    const url = new URL(path ?? currentSpaPath ?? window.location.href, window.location.origin);
    url.searchParams.delete("tgAuth");
    url.hash = "";
    return `${url.pathname}${url.search}`;
  } catch {
    return path ?? currentSpaPath;
  }
}

export function rememberTelegramSpaPath(path: string): void {
  currentSpaPath = storePathKey(path);
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

function pushCurrentPath(): void {
  const here = currentSpaPath || storePathKey();
  if (!here) return;
  const stack = readNavStack();
  if (stack[stack.length - 1] === here) return;
  stack.push(here);
  writeNavStack(stack);
}

/**
 * In-Mini-App navigation. Full `location.assign` makes Android Telegram flash Oops
 * (WebView unload). Use Next.js client navigation instead; Android history is a no-op.
 */
export function assignStorePath(path: string, opts?: { back?: boolean }): void {
  if (typeof window === "undefined") return;
  const next = storePathKey(path);
  if (!next) return;
  if (!opts?.back && (currentSpaPath || storePathKey()) !== next) pushCurrentPath();
  currentSpaPath = next;
  if (spaNavigate) {
    spaNavigate(next);
    return;
  }
  window.__SUPREX_TG_QUEUE = window.__SUPREX_TG_QUEUE ?? [];
  window.__SUPREX_TG_QUEUE.push(next);
}

export function registerTelegramSpaNavigate(fn: ((path: string) => void) | null): void {
  spaNavigate = fn;
  if (typeof window === "undefined") return;
  if (!fn) {
    window.__SUPREX_TG_GO = undefined;
    return;
  }
  window.__SUPREX_TG_GO = (path: string) => assignStorePath(path);
  const queued = window.__SUPREX_TG_QUEUE;
  window.__SUPREX_TG_QUEUE = [];
  if (Array.isArray(queued)) {
    for (const pending of queued) assignStorePath(pending);
  }
}

export function navigateStorePath(path: string, spaNavigateFn: (path: string) => void): void {
  if (isTelegramMiniAppDocument()) assignStorePath(path);
  else spaNavigateFn(path);
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
