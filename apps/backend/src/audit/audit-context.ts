import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditContext, AuditRequestContext } from "./audit.types";

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}

export function withAuditSource<T>(
  source: NonNullable<AuditRequestContext["source"]>,
  actorId: string,
  fn: () => T,
  extra?: Pick<AuditRequestContext, "path" | "job">,
): T {
  return runWithAuditContext(
    {
      actor: { id: actorId, role: null },
      request: { source, ...extra },
    },
    fn,
  );
}
