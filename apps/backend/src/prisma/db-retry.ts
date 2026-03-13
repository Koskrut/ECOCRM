function isConnectionClosedError(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code === "P1017") return true;
  const msg = err?.message ?? (e instanceof Error ? e.message : String(e));
  return (
    typeof msg === "string" &&
    (msg.includes("Server has closed the connection") ||
      msg.includes("Connection terminated unexpectedly") ||
      msg.includes("ConnectionClosed"))
  );
}

export type WithRetryOnConnectionClosedOptions = {
  /** Run before retry (e.g. prisma.$disconnect + $connect) so the pool gets fresh connections. */
  onBeforeRetry?: () => Promise<void>;
};

/**
 * Runs `fn` and on connection-closed errors retries once.
 * If onBeforeRetry is provided (e.g. Prisma $disconnect + $connect), it is run before the retry so the pool uses fresh connections.
 */
export async function withRetryOnConnectionClosed<T>(
  fn: () => Promise<T>,
  options?: WithRetryOnConnectionClosedOptions,
): Promise<T> {
  try {
    return await fn();
  } catch (e: unknown) {
    // #region agent log
    const err = e as { code?: string; message?: string };
    const msg = err?.message ?? (e instanceof Error ? (e as Error).message : String(e));
    const isMatch = isConnectionClosedError(e);
    fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a983d" },
      body: JSON.stringify({
        sessionId: "7a983d",
        hypothesisId: isMatch ? "H2" : "H1",
        location: "db-retry.ts:catch",
        message: "db-retry catch",
        data: { code: err?.code, message: String(msg).slice(0, 300), isMatch, willRetry: isMatch },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!isMatch) throw e;
    await options?.onBeforeRetry?.();
    // Give pool time to drop dead client(s) before acquiring again (pg removes on client error)
    await new Promise((r) => setTimeout(r, 1500));
    // #region agent log
    fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a983d" },
      body: JSON.stringify({
        sessionId: "7a983d",
        hypothesisId: "H2",
        location: "db-retry.ts:retry",
        message: "db-retry retry start",
        data: {},
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    try {
      const out = await fn();
      // #region agent log
      fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a983d" },
        body: JSON.stringify({
          sessionId: "7a983d",
          hypothesisId: "H2",
          location: "db-retry.ts:retrySuccess",
          message: "db-retry retry success",
          data: {},
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return out;
    } catch (e2) {
      // #region agent log
      const err2 = e2 as { code?: string; message?: string };
      const msg2 = err2?.message ?? (e2 instanceof Error ? (e2 as Error).message : String(e2));
      fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "7a983d" },
        body: JSON.stringify({
          sessionId: "7a983d",
          hypothesisId: "H2",
          location: "db-retry.ts:retryFailed",
          message: "db-retry retry failed",
          data: { message: String(msg2).slice(0, 300) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw e2;
    }
  }
}
