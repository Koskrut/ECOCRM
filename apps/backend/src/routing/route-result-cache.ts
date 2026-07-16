/** Short-lived in-memory cache for routed geometry/metrics (dedupe bundle + fuel). */
export class RouteResultCache<T> {
  private readonly store = new Map<string, { expiresAt: number; value: T }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  get(key: string): T | undefined {
    const row = this.store.get(key);
    if (!row) return undefined;
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return row.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const first = this.store.keys().next().value;
      if (first) this.store.delete(first);
    }
    this.store.set(key, { expiresAt: Date.now() + this.ttlMs, value });
  }

  clear(): void {
    this.store.clear();
  }
}
