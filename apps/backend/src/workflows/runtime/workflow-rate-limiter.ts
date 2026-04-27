const ONE_HOUR_MS = 60 * 60 * 1000;

export class WorkflowRateLimiter {
  private readonly executions = new Map<string, number[]>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  allow(ruleId: string, entityId: string | null | undefined, limit: number): boolean {
    if (!entityId) return true;
    const key = `${ruleId}:${entityId}`;
    const cutoff = this.now() - ONE_HOUR_MS;
    const recent = (this.executions.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= limit) {
      this.executions.set(key, recent);
      return false;
    }
    recent.push(this.now());
    this.executions.set(key, recent);
    return true;
  }

  reset() {
    this.executions.clear();
  }
}
