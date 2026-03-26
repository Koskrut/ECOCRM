/**
 * Maps LOG_LEVEL env to Nest built-in logger levels (no PII).
 */
export function nestLogLevelsFromEnv(): ("error" | "warn" | "log" | "debug" | "verbose")[] {
  const raw = (process.env.LOG_LEVEL ?? "log").trim().toLowerCase();
  switch (raw) {
    case "error":
      return ["error"];
    case "warn":
      return ["error", "warn"];
    case "log":
    case "info":
      return ["error", "warn", "log"];
    case "debug":
      return ["error", "warn", "log", "debug"];
    case "verbose":
      return ["error", "warn", "log", "debug", "verbose"];
    default:
      return ["error", "warn", "log"];
  }
}
