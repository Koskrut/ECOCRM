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
    if (!isConnectionClosedError(e)) throw e;
    await options?.onBeforeRetry?.();
    // Give pool time to drop dead client(s) before acquiring again (pg removes on client error)
    await new Promise((r) => setTimeout(r, 1500));
    return await fn();
  }
}
