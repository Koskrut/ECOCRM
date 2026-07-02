import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "crm_error_log";
const MAX_ENTRIES = 5;

export type ErrorLogEntry = {
  at: string;
  message: string;
  type: "info" | "warn" | "error" | "rejection";
};

export async function appendErrorLog(
  message: string,
  type: ErrorLogEntry["type"] = "error",
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const list: ErrorLogEntry[] = raw ? (JSON.parse(raw) as ErrorLogEntry[]) : [];
    list.unshift({
      at: new Date().toISOString(),
      message: message.slice(0, 500),
      type,
    });
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore storage failures
  }
}

export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ErrorLogEntry[]) : [];
  } catch {
    return [];
  }
}

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

export function installGlobalErrorHandlers(): void {
  const g = global as typeof globalThis & { ErrorUtils?: ErrorUtilsLike };
  if (g.ErrorUtils) {
    const prev = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((error, isFatal) => {
      void appendErrorLog(error?.message ?? String(error));
      if (__DEV__) console.error("[CRM fatal]", error, isFatal);
      prev(error, isFatal);
    });
  }

  const proc = global as typeof globalThis & {
    process?: { on?: (event: string, cb: (reason: unknown) => void) => void };
  };
  proc.process?.on?.("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    void appendErrorLog(msg, "rejection");
    if (__DEV__) console.warn("[CRM rejection]", msg);
  });
}
