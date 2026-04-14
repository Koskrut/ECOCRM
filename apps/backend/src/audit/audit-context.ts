import { AsyncLocalStorage } from "node:async_hooks";
import type { AuditActor, AuditRequestContext } from "./audit.types";

export type AuditContext = {
  actor: AuditActor;
  request?: AuditRequestContext;
};

const storage = new AsyncLocalStorage<AuditContext>();

export function runWithAuditContext<T>(ctx: AuditContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditContext | undefined {
  return storage.getStore();
}
